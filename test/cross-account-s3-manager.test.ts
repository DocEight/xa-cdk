import { App, Stack } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import { CrossAccountS3BucketManager } from "../lib";

const PYTHON_RUNTIME = "python3.13";

const getPoliciesMatcher = (bucketName: string, bucketAwsId: string) =>
  Match.arrayWith([
    Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectEquals({
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Resource: `arn:aws:iam::${bucketAwsId}:role/${bucketName}-xa-mgmt`,
          }),
        ]),
      }),
    }),
  ]);

const getEventMatcher = (operation: string, distributionIds: string[]) =>
  Match.objectEquals({
    "Fn::Join": Match.arrayEquals([
      "",
      Match.arrayWith([
        Match.stringLikeRegexp(
          [operation, "cloudfrontAccessors", ...distributionIds].join("(.+)"),
        ),
      ]),
    ]),
  });

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
  CrossAccountS3BucketManager.allowCloudfront(
    stack,
    distributionIds[0],
    xaBucketName,
  );
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
    Create: getEventMatcher("create", distributionIds),
    Update: getEventMatcher("update", distributionIds),
    Delete: getEventMatcher("delete", distributionIds),
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
    CrossAccountS3BucketManager.allowCloudfront(
      stack,
      distributionId,
      xaBucketName,
    );
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
    Create: getEventMatcher("create", distributionIds),
    Update: getEventMatcher("update", distributionIds),
    Delete: getEventMatcher("delete", distributionIds),
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
    CrossAccountS3BucketManager.allowCloudfront(stack, "bad :(", xaBucketName),
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

  // WHEN
  CrossAccountS3BucketManager.allowCloudfront(
    stack,
    distributionIds1[0],
    xaBucketName1,
  );
  for (const distributionId of distributionIds2) {
    CrossAccountS3BucketManager.allowCloudfront(
      stack,
      distributionId,
      xaBucketName2,
    );
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
    Create: getEventMatcher("create", distributionIds1),
    Update: getEventMatcher("update", distributionIds1),
    Delete: getEventMatcher("delete", distributionIds1),
  });

  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName2}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName2, xaAwsId2),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher("create", distributionIds2),
    Update: getEventMatcher("update", distributionIds2),
    Delete: getEventMatcher("delete", distributionIds2),
  });
});
