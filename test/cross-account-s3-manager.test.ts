import { App, Stack } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { CrossAccountS3BucketManager } from "../lib";

import { getPoliciesMatcher, getEventMatcher } from "./matchers";
import { PYTHON_RUNTIME, S3_DEFAULT_ACTIONS } from "./const";

test("Single XAS3 Manager", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xas3-mgr";
  const xaBucketName = "test-xas3";
  const xaAwsId = "098765432109";

  // WHEN
  new CrossAccountS3BucketManager(stack, managerId, {
    xaBucketName,
    xaAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName, xaAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {});
});

test("XAS3 Manager single accessor", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xas3-mgr";
  const xaBucketName = "test-xas3-s";
  const xaAwsId = "098765432109";
  const distributionIds = ["SOME_ID"];

  // WHEN
  CrossAccountS3BucketManager.allowCloudfront({
    scope: stack,
    distributionId: distributionIds[0],
    bucketName: xaBucketName,
  });
  new CrossAccountS3BucketManager(stack, managerId, {
    xaBucketName,
    xaAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName, xaAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher(
      "create",
      managerId,
      distributionIds,
      S3_DEFAULT_ACTIONS,
    ),
    Update: getEventMatcher(
      "update",
      managerId,
      distributionIds,
      S3_DEFAULT_ACTIONS,
    ),
    Delete: getEventMatcher(
      "delete",
      managerId,
      distributionIds,
      S3_DEFAULT_ACTIONS,
    ),
  });
});

test("XAS3 Manager multiple accessors", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xas3-mgr";
  const xaBucketName = "test-xas3-m";
  const xaAwsId = "098765432109";
  const distributionIds = [
    "SOME_ID",
    "ANOTHER_ID",
    "YET_ANOTHER_ID",
    "SO_MANY_IDS",
  ].sort();

  // WHEN
  for (const distributionId of distributionIds) {
    CrossAccountS3BucketManager.allowCloudfront({
      scope: stack,
      distributionId,
      bucketName: xaBucketName,
    });
  }
  new CrossAccountS3BucketManager(stack, managerId, {
    xaBucketName,
    xaAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName, xaAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher(
      "create",
      managerId,
      distributionIds,
      S3_DEFAULT_ACTIONS,
    ),
    Update: getEventMatcher(
      "update",
      managerId,
      distributionIds,
      S3_DEFAULT_ACTIONS,
    ),
    Delete: getEventMatcher(
      "delete",
      managerId,
      distributionIds,
      S3_DEFAULT_ACTIONS,
    ),
  });
});

test("XAS3 Manager improper usage", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xas3-mgr";
  const xaBucketName = "test-xas3-BAD";
  const xaAwsId = "098765432109";

  new CrossAccountS3BucketManager(stack, managerId, {
    xaBucketName,
    xaAwsId,
  });

  expect(() =>
    CrossAccountS3BucketManager.allowCloudfront({
      scope: stack,
      distributionId: "bad :(",
      bucketName: xaBucketName,
    }),
  ).toThrow(/Cannot register .+ after creation./);
});

test("Multiple XAS3 Managers", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId1 = "test-xas3-mgr1";
  const xaBucketName1 = "test-xas3-s1";
  const xaAwsId1 = "123456789012";
  const distributionIds1 = ["SOME_ID"];
  const managerId2 = "test-xas3-mgr2";
  const xaBucketName2 = "test-xas3-m2";
  const xaAwsId2 = "098765432109";
  const distributionIds2 = [
    "SOME_ID",
    "ANOTHER_ID",
    "YET_ANOTHER_ID",
    "SO_MANY_IDS",
  ].sort();
  const actions2 = ["s3:GetObject", "s3:PutObject"];

  // WHEN
  CrossAccountS3BucketManager.allowCloudfront({
    scope: stack,
    distributionId: distributionIds1[0],
    bucketName: xaBucketName1,
  });
  for (const distributionId of distributionIds2) {
    CrossAccountS3BucketManager.allowCloudfront({
      scope: stack,
      distributionId,
      bucketName: xaBucketName2,
      actions: actions2,
    });
  }
  new CrossAccountS3BucketManager(stack, managerId1, {
    xaBucketName: xaBucketName1,
    xaAwsId: xaAwsId1,
  });
  new CrossAccountS3BucketManager(stack, managerId2, {
    xaBucketName: xaBucketName2,
    xaAwsId: xaAwsId2,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName1}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName1, xaAwsId1),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher(
      "create",
      managerId1,
      distributionIds1,
      S3_DEFAULT_ACTIONS,
    ),
    Update: getEventMatcher(
      "update",
      managerId1,
      distributionIds1,
      S3_DEFAULT_ACTIONS,
    ),
    Delete: getEventMatcher(
      "delete",
      managerId1,
      distributionIds1,
      S3_DEFAULT_ACTIONS,
    ),
  });

  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName2}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName2, xaAwsId2),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher("create", managerId2, distributionIds2, actions2),
    Update: getEventMatcher("update", managerId2, distributionIds2, actions2),
    Delete: getEventMatcher("delete", managerId2, distributionIds2, actions2),
  });
});
