import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { OmniCmsAwsPoc } from '../src/main';

test('Snapshot', () => {
  const app = new App();
  const stack = new OmniCmsAwsPoc(app, 'test');

  expect(stack).toHaveResource('AWS::ECS::Service');
  expect(stack).toHaveResource('AWS::RDS::DBCluster');
  expect(stack).toHaveResource('AWS::EFS::FileSystem');
  expect(stack).toHaveResource('AWS::WAFv2::WebACL');
  expect(stack).toHaveResource('AWS::CloudFront::Distribution');

  expect(app.synth().getStackArtifact(stack.artifactId).template).toMatchSnapshot();
});