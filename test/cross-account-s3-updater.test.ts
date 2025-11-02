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
          [operation, "cloudfrontDistributionIds", ...distributionIds].join(
            "(.+)",
          ),
        ),
      ]),
    ]),
  });

test("Single XAS3 Manager", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xas3-mgr";
  const bucketName = "test-xas3";
  const bucketAwsId = "098765432109";

  // WHEN
  new CrossAccountS3BucketManager(stack, managerId, {
    bucketName,
    bucketAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${bucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(bucketName, bucketAwsId),
  });
  template.hasResourceProperties("Custom::AWS", {});
});

test("XAS3 Manager single accessor", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId = "test-xas3-mgr";
  const bucketName = "test-xas3-s";
  const bucketAwsId = "098765432109";
  const distributionIds = ["SOME_ID"];

  // WHEN
  CrossAccountS3BucketManager.allowCloudfront(bucketName, distributionIds[0]);
  new CrossAccountS3BucketManager(stack, managerId, {
    bucketName,
    bucketAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${bucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(bucketName, bucketAwsId),
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
  const bucketName = "test-xas3-m";
  const bucketAwsId = "098765432109";
  const distributionIds = [
    "SOME_ID",
    "ANOTHER_ID",
    "YET_ANOTHER_ID",
    "SO_MANY_IDS",
  ].sort();

  // WHEN
  for (const distributionId of distributionIds) {
    CrossAccountS3BucketManager.allowCloudfront(bucketName, distributionId);
  }
  new CrossAccountS3BucketManager(stack, managerId, {
    bucketName,
    bucketAwsId,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${bucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(bucketName, bucketAwsId),
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
  const bucketName = "test-xas3-BAD";
  const bucketAwsId = "098765432109";

  new CrossAccountS3BucketManager(stack, managerId, {
    bucketName,
    bucketAwsId,
  });

  expect(() =>
    CrossAccountS3BucketManager.allowCloudfront(bucketName, "bad :("),
  ).toThrow(/Cannot register .+ after creation./);
});

test("Multiple XAS3 Managers", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const managerId1 = "test-xas3-mgr1";
  const bucketName1 = "test-xas3-s1";
  const bucketAwsId1 = "123456789012";
  const distributionIds1 = ["SOME_ID"];
  const managerId2 = "test-xas3-mgr2";
  const bucketName2 = "test-xas3-m2";
  const bucketAwsId2 = "098765432109";
  const distributionIds2 = [
    "SOME_ID",
    "ANOTHER_ID",
    "YET_ANOTHER_ID",
    "SO_MANY_IDS",
  ].sort();

  // WHEN
  CrossAccountS3BucketManager.allowCloudfront(bucketName1, distributionIds1[0]);
  for (const distributionId of distributionIds2) {
    CrossAccountS3BucketManager.allowCloudfront(bucketName2, distributionId);
  }
  new CrossAccountS3BucketManager(stack, managerId1, {
    bucketName: bucketName1,
    bucketAwsId: bucketAwsId1,
  });
  new CrossAccountS3BucketManager(stack, managerId2, {
    bucketName: bucketName2,
    bucketAwsId: bucketAwsId2,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${bucketName1}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(bucketName1, bucketAwsId1),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher("create", distributionIds1),
    Update: getEventMatcher("update", distributionIds1),
    Delete: getEventMatcher("delete", distributionIds1),
  });

  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${bucketName2}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(bucketName2, bucketAwsId2),
  });
  template.hasResourceProperties("Custom::AWS", {
    Create: getEventMatcher("create", distributionIds2),
    Update: getEventMatcher("update", distributionIds2),
    Delete: getEventMatcher("delete", distributionIds2),
  });
});
