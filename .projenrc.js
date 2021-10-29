const { AwsCdkTypeScriptApp, ProjectType } = require('projen');
const project = new AwsCdkTypeScriptApp({
  cdkVersion: '1.95.2',
  defaultReleaseBranch: 'main',
  name: 'cdk-tomee-fargate-rds-efs',
  authorAddress: 'aaron@aaronbrighton.ca',
  authorName: 'Aaron Brighton',
  cdkDependencies: [
    '@aws-cdk/aws-ec2',
    '@aws-cdk/aws-ecs',
    '@aws-cdk/aws-ecs-patterns',
    '@aws-cdk/aws-rds',
    '@aws-cdk/aws-efs',
    '@aws-cdk/aws-cloudfront',
    '@aws-cdk/aws-cloudfront-origins',
    '@aws-cdk/aws-elasticloadbalancingv2',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-route53-targets',
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-wafv2',
  ],
  projectType: ProjectType.APP,
  release: false,
  licensed: false,
});

const common_exclude = ['src/docker/fargate.rds.efs.test/target'];
project.npmignore.exclude(...common_exclude);
project.gitignore.exclude(...common_exclude);

project.synth();