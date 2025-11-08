import { App, Stack } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { CrossAccountKmsKeyManager } from "../lib";

import { getPoliciesMatcher, getEventMatcher } from "./matchers";
import { PYTHON_RUNTIME, KMS_DEFAULT_ACTIONS } from "./const";

test("Single XAKMS Manager", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xakms-mgr";
  const xaKeyId = "test-xakms";
  const xaAwsId = "098765432109";

  // WHEN
  new CrossAccountKmsKeyManager(stack, managerId, {
    xaKeyId,
    xaAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaKeyId}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaKeyId, xaAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {});
});

test("XAKMS Manager single accessor", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xakms-mgr";
  const xaKeyId = "test-xakms";
  const xaAwsId = "098765432109";
  const distributionIds = ["SOME_ID"];

  // WHEN
  CrossAccountKmsKeyManager.allowCloudfront(stack, distributionIds[0], xaKeyId);
  new CrossAccountKmsKeyManager(stack, managerId, {
    xaKeyId,
    xaAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaKeyId}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaKeyId, xaAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher(
      "create",
      managerId,
      distributionIds,
      KMS_DEFAULT_ACTIONS,
    ),
    Update: getEventMatcher(
      "update",
      managerId,
      distributionIds,
      KMS_DEFAULT_ACTIONS,
    ),
    Delete: getEventMatcher(
      "delete",
      managerId,
      distributionIds,
      KMS_DEFAULT_ACTIONS,
    ),
  });
});

test("XAKMS Manager multiple accessors", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xakms-mgr";
  const xaKeyId = "test-xakms";
  const xaAwsId = "098765432109";
  const distributionIds = [
    "SOME_ID",
    "ANOTHER_ID",
    "YET_ANOTHER_ID",
    "SO_MANY_IDS",
  ].sort();

  // WHEN
  for (const distributionId of distributionIds) {
    CrossAccountKmsKeyManager.allowCloudfront(stack, distributionId, xaKeyId);
  }
  new CrossAccountKmsKeyManager(stack, managerId, {
    xaKeyId,
    xaAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaKeyId}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaKeyId, xaAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher(
      "create",
      managerId,
      distributionIds,
      KMS_DEFAULT_ACTIONS,
    ),
    Update: getEventMatcher(
      "update",
      managerId,
      distributionIds,
      KMS_DEFAULT_ACTIONS,
    ),
    Delete: getEventMatcher(
      "delete",
      managerId,
      distributionIds,
      KMS_DEFAULT_ACTIONS,
    ),
  });
});

test("XAKMS Manager improper usage", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xakms-mgr";
  const xaKeyId = "test-xakms-BAD";
  const xaAwsId = "098765432109";

  new CrossAccountKmsKeyManager(stack, managerId, {
    xaKeyId,
    xaAwsId,
  });

  expect(() =>
    CrossAccountKmsKeyManager.allowCloudfront(stack, "bad :(", xaKeyId),
  ).toThrow(/Cannot register .+ after creation./);
});

test("Multiple XAKMS Managers", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId1 = "test-xakms-mgr1";
  const xaKeyId1 = "test-xakms-s1";
  const xaAwsId1 = "123456789012";
  const distributionIds1 = ["SOME_ID"];
  const managerId2 = "test-xakms-mgr2";
  const xaKeyId2 = "test-xakms-m2";
  const xaAwsId2 = "098765432109";
  const distributionIds2 = [
    "SOME_ID",
    "ANOTHER_ID",
    "YET_ANOTHER_ID",
    "SO_MANY_IDS",
  ].sort();
  const actions2 = ["kms:ListKeys", ...KMS_DEFAULT_ACTIONS];

  // WHEN
  CrossAccountKmsKeyManager.allowCloudfront(
    stack,
    distributionIds1[0],
    xaKeyId1,
  );
  for (const distributionId of distributionIds2) {
    CrossAccountKmsKeyManager.allowCloudfront(
      stack,
      distributionId,
      xaKeyId2,
      actions2,
    );
  }
  new CrossAccountKmsKeyManager(stack, managerId1, {
    xaKeyId: xaKeyId1,
    xaAwsId: xaAwsId1,
  });
  new CrossAccountKmsKeyManager(stack, managerId2, {
    xaKeyId: xaKeyId2,
    xaAwsId: xaAwsId2,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaKeyId1}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaKeyId1, xaAwsId1),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher(
      "create",
      managerId1,
      distributionIds1,
      KMS_DEFAULT_ACTIONS,
    ),
    Update: getEventMatcher(
      "update",
      managerId1,
      distributionIds1,
      KMS_DEFAULT_ACTIONS,
    ),
    Delete: getEventMatcher(
      "delete",
      managerId1,
      distributionIds1,
      KMS_DEFAULT_ACTIONS,
    ),
  });

  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaKeyId2}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaKeyId2, xaAwsId2),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher("create", managerId2, distributionIds2, actions2),
    Update: getEventMatcher("update", managerId2, distributionIds2, actions2),
    Delete: getEventMatcher("delete", managerId2, distributionIds2, actions2),
  });
});
