import { App, Stack } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";

import { CrossAccountKmsKey } from "../lib/kms";
import { getAssumeRolePolicyMatcher, getRoleNameMatcher } from "./matchers";

test("Single Accessor XAKMS", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const keyId = "test-xakms-single-accessor";
  const alias = "test-xakms-s";
  const xaAwsIds = ["000000000000"];
  // WHEN
  new CrossAccountKmsKey(stack, keyId, {
    alias,
    xaAwsIds,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResource("AWS::KMS::Key", {});
  template.hasResourceProperties("AWS::KMS::Alias", {
    AliasName: `alias/${alias}`,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(keyId),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(keyId, xaAwsIds),
  });
});

test("Multi Accessor XAKMS", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const keyId = "test-xakms-multi-accessor";
  const alias = "test-xakms-m";
  const xaAwsIds = ["000000000000", "111111111111", "222222222222"];
  // WHEN
  new CrossAccountKmsKey(stack, keyId, {
    alias,
    xaAwsIds,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResource("AWS::KMS::Key", {});
  template.hasResourceProperties("AWS::KMS::Alias", {
    AliasName: `alias/${alias}`,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(keyId),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(keyId, xaAwsIds),
  });
});

test("Several XAKMSes", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const keyId1 = "test-xakms-1";
  const alias1 = "test-xakms-alias-1";
  const xaAwsIds1 = ["000000000000"];
  const keyId2 = "test-xakms-2";
  const xaAwsIds2 = ["111111111111"];
  // WHEN
  new CrossAccountKmsKey(stack, keyId1, {
    alias: alias1,
    xaAwsIds: xaAwsIds1,
  });
  new CrossAccountKmsKey(stack, keyId2, {
    xaAwsIds: xaAwsIds2,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResource("AWS::KMS::Key", {});
  template.hasResourceProperties("AWS::KMS::Alias", {
    AliasName: `alias/${alias1}`,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(keyId1),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(keyId1, xaAwsIds1),
  });

  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(keyId2),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(keyId2, xaAwsIds2),
  });
});
