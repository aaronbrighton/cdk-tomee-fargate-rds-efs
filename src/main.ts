import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as efs from '@aws-cdk/aws-efs';
import * as rds from '@aws-cdk/aws-rds';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as wafv2 from '@aws-cdk/aws-wafv2';
import { App, Construct, Stack, StackProps, CfnOutput } from '@aws-cdk/core';

export class ContainerApp extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Because the DatabaseCluster needs to exist before creation of the ApplicationLoadBalancedFargateService, we manually create the VPC
    const vpc = new ec2.Vpc(this, 'Vpc');

    // Create the DatabaseCluster with an initial database named "omnicms", credentials for admin use will be published to Secrets Manager
    const rdsCluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_11_9,
      }),
      instanceProps: {
        vpc,
      },
      defaultDatabaseName: 'containerapp',
    });

    // Create the EFS FileSystem
    const fileSystem = new efs.FileSystem(this, 'EfsFileSystem', {
      vpc,
    });

    // Pull in existing Route53 zone so we can create some custom domain names for HTTPS on the LB and CloudFront distribution
    const publicZone = route53.HostedZone.fromHostedZoneAttributes(this, 'route53-zone', {
      hostedZoneId: this.node.tryGetContext('customDomainZoneId'),
      zoneName: this.node.tryGetContext('customDomainZoneName'),
    });

    // Finally create the Fargate tasks (containers) as part of an ECS service and front it with a publicly accessible load balancer
    const customLBDomainName = `lb${this.node.tryGetContext('customDomain')}`; // Due to our use of ApplicationLoadBalancedFargateService construct if we want HTTPS we need a custom domain name :/.
    const loadBalancedFargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      vpc,
      memoryLimitMiB: 1024,
      cpu: 512,
      desiredCount: 2,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, 'docker')),
        containerPort: 8080,
        secrets: {
          DB_HOST: ecs.Secret.fromSecretsManager(rdsCluster.secret!, 'host'),
          DB_NAME: ecs.Secret.fromSecretsManager(rdsCluster.secret!, 'dbname'),
          DB_PORT: ecs.Secret.fromSecretsManager(rdsCluster.secret!, 'port'),
          DB_USER: ecs.Secret.fromSecretsManager(rdsCluster.secret!, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(rdsCluster.secret!, 'password'),
        },
      },
      protocol: elbv2.ApplicationProtocol.HTTPS,
      redirectHTTP: true,
      domainName: customLBDomainName,
      domainZone: publicZone,
    });

    // Open up ports on RDS and EFS to accept connections from the Fargate tasks
    rdsCluster.connections.allowDefaultPortFrom(loadBalancedFargateService.service);
    fileSystem.connections.allowDefaultPortFrom(loadBalancedFargateService.service);

    // Use escape hatch to add the EFS volume to the Fargate service
    (loadBalancedFargateService.node.tryFindChild('TaskDef') as ecs.TaskDefinition)?.addVolume({
      name: 'staging',
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    });

    // Use escape hatch to mount the EFS volume to /staging on the tasks
    (loadBalancedFargateService.node.tryFindChild('TaskDef') as ecs.TaskDefinition).findContainer('web')?.addMountPoints({
      containerPath: '/staging',
      readOnly: false,
      sourceVolume: 'staging',
    });

    // Create a WAF WebACL to provide IP allow list and rate limiting functionality
    const webAcl = new wafv2.CfnWebACL(this, 'cloudFrontWafAcl', {
      defaultAction: this.node.tryGetContext('ipAllowList') ? { block: {} } : { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: this.node.id + '-waf-acl',
        sampledRequestsEnabled: true
      },
      rules: [
        {
          action: {
            block: {}
          },
          name: 'rate-limit',
          priority: 0,
          statement: {
            rateBasedStatement: {
              aggregateKeyType: 'IP',
              limit: 250
            }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: this.node.id + '-waf-acl-rate-limit',
            sampledRequestsEnabled: true
          },
        },
        {
          action: {
            allow: {}
          },
          name: 'ip-whitelist',
          priority: 1,
          statement: {
            ipSetReferenceStatement: {
              arn: new wafv2.CfnIPSet(this, 'cloudFrontWafAclIpSet', {
                addresses: this.node.tryGetContext('ipAllowList') || [],
                ipAddressVersion: 'IPV4',
                scope: 'CLOUDFRONT',
              }).attrArn,
            }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: this.node.id + '-waf-acl-ip-whitelist',
            sampledRequestsEnabled: true
          }
        }
      ]
    });

    // Create a custom SSL/TLS certificate to be used with Cloudfront
    const customCertificate = new acm.Certificate(this, 'custom-certificate', {
      domainName: this.node.tryGetContext('customDomain'),
      validation: acm.CertificateValidation.fromDns(publicZone),
    });

    // Cloudfront distribution to sit infront of the load balancer to take advantage of AWS back-bone, optimized rate limiting/anti-ddos, and future cacheing functionality.
    const cdn = new cloudfront.Distribution(this, 'CloudfrontDistribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(customLBDomainName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.MATCH_VIEWER,
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      domainNames: [
        this.node.tryGetContext('customDomain'),
      ],
      certificate: customCertificate,
      webAclId: webAcl.attrArn,
    });

    // IPv4 DNS record for custom domain pointing to Cloudfront distribution.
    new route53.ARecord(this, `Route53ARecord`, {
      zone: publicZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdn)),
      recordName: this.node.tryGetContext('customDomain'),
    });

    // IPv6 DNS record for custom domain pointing to Cloudfront distribution.
    new route53.AaaaRecord(this, `Route53AaaaRecord`, {
      zone: publicZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdn)),
      recordName: this.node.tryGetContext('customDomain'),
    });

    // Print out the Cloudfront URL endpoint.
    new CfnOutput(this, 'CdnEndpoint', {
      value: `https://${this.node.tryGetContext('customDomain')}/`,
    });
    
  }
}

const app = new App();

new ContainerApp(app, 'container-app');

app.synth();