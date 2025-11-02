import { App, Stack } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import { CrossAccountS3Bucket } from "../lib";

const getRoleNameMatcher = (bucketId: string) =>
  Match.objectEquals({
    "Fn::Join": Match.arrayEquals([
      "",
      Match.arrayEquals([
        Match.objectEquals({
          Ref: Match.stringLikeRegexp(`^${bucketId.replaceAll("-", "")}`),
        }),
        "-xa-mgmt",
      ]),
    ]),
  });

const getAwsPrincipalMatcher = (bucketName: string, id: string) =>
  Match.objectEquals({
    "Fn::Join": Match.arrayEquals([
      "",
      Match.arrayEquals([
        `arn:aws:iam::${id}:role/`,
        Match.objectEquals({
          Ref: Match.stringLikeRegexp(`^${bucketName.replaceAll("-", "")}`),
        }),
        "-xa-mgmt-ex",
      ]),
    ]),
  });

const getAssumeRolePolicyMatcher = (bucketName: string, xaAwsIds: string[]) =>
  Match.objectLike({
    Statement: Match.arrayWith([
      Match.objectLike({
        Action: "sts:AssumeRole",
        Principal: Match.objectLike({
          AWS:
            xaAwsIds.length == 1
              ? getAwsPrincipalMatcher(bucketName, xaAwsIds[0])
              : xaAwsIds.map((id) => getAwsPrincipalMatcher(bucketName, id)),
        }),
      }),
    ]),
    Version: "2012-10-17",
  });

test("Single Accessor XAS3", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const bucketId = "test-xas3-single-accessor";
  const bucketName = "test-xas3-s";
  const xaAwsIds = ["000000000000"];
  // WHEN
  new CrossAccountS3Bucket(stack, bucketId, {
    bucketName,
    xaAwsIds,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: "test-xas3-s",
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(bucketId),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(bucketName, xaAwsIds),
  });
});

test("Multi Accessor XAS3", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const bucketId = "test-xas3-multi-accessor";
  const bucketName = "test-xas3-m";
  const xaAwsIds = ["000000000000", "111111111111", "222222222222"];
  // WHEN
  new CrossAccountS3Bucket(stack, bucketId, {
    bucketName,
    xaAwsIds,
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: "test-xas3-m",
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(bucketId),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(bucketName, xaAwsIds),
  });
});

test("Longish XAS3", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const bucketId = "test-xas3-loooooooooooong";
  const looongBucketName =
    "test-xas3-loooooooooooooooooooooooooooooooooooongish";
  // WHEN
  new CrossAccountS3Bucket(stack, bucketId, {
    bucketName: looongBucketName,
    xaAwsIds: ["000000000000"],
  });
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: looongBucketName,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(bucketId),
  });
});

test("Loooooooooooong XAS3", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const bucketId = "test-xas3-loooooooooooong";
  const looongBucketName =
    "test-xas3-loooooooooo00000000000000000000000000oooooooooooooong";

  expect(
    () =>
      new CrossAccountS3Bucket(stack, bucketId, {
        bucketName: looongBucketName,
        xaAwsIds: ["000000000000"],
      }),
  ).toThrow(/must be 52 characters or less/);
});

test("Several XAS3s", () => {
  const app = new App();
  const stack = new Stack(app, "test-stack");
  const bucketId1 = "test-xas3-1";
  const xaAwsIds1 = ["000000000000"];
  const bucketId2 = "test-xas3-2";
  const xaAwsIds2 = ["111111111111"];
  // WHEN
  new CrossAccountS3Bucket(stack, bucketId1, {
    bucketName: bucketId1,
    xaAwsIds: xaAwsIds1,
  });
  new CrossAccountS3Bucket(stack, bucketId2, {
    bucketName: bucketId2,
    xaAwsIds: xaAwsIds2,
  });
  // THEN
  const template = Template.fromStack(stack);

  // Do me later
  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: bucketId1,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(bucketId1),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(bucketId1, xaAwsIds1),
  });
  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: bucketId2,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(bucketId2),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(bucketId2, xaAwsIds2),
  });
});
