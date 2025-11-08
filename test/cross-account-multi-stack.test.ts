import { App, Stack } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { CrossAccountS3Bucket, CrossAccountS3BucketManager } from "../lib";

import {
  getPoliciesMatcher,
  getEventMatcher,
  getRoleNameMatcher,
  getAssumeRolePolicyMatcher,
} from "./matchers";
import {
  PYTHON_RUNTIME,
  S3_DEFAULT_ACTIONS,
  KMS_DEFAULT_ACTIONS,
} from "./const";

test("Cloudfront to S3 (SSE:S3)", () => {
  const app = new App();
  const accessedStack = new Stack(app, "accessed-stack");
  const accessedAwsId = "000000000000";
  const xaBucketId = "test-xas3-id";
  const xaBucketName = "test-xas3";
  const accessorStack = new Stack(app, "accessor-stack");
  const accessorAwsId = "111111111111";
  const distributionId = "test-accessor-distribution";
  const managerId = "test-xas3-mgr";

  // WHEN
  const bucket = new CrossAccountS3Bucket(accessedStack, xaBucketId, {
    bucketName: xaBucketName,
    xaAwsIds: [accessorAwsId],
  });
  const distribution = new cloudfront.Distribution(
    accessorStack,
    distributionId,
    {
      defaultBehavior: {
        origin: new origins.HttpOrigin("http://asickapplication/"),
      },
    },
  );
  CrossAccountS3BucketManager.allowCloudfront({
    scope: distribution,
    bucketName: xaBucketName,
    distributionId: distribution.distributionId,
  });
  new CrossAccountS3BucketManager(accessorStack, managerId, {
    xaBucketName,
    xaAwsId: accessedAwsId,
  });

  // THEN
  const accessedTemplate = Template.fromStack(accessedStack);
  const accessorTemplate = Template.fromStack(accessorStack);

  accessedTemplate.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: xaBucketName,
  });
  accessedTemplate.hasResourceProperties("AWS::IAM::Role", {
    RoleName: getRoleNameMatcher(xaBucketId),
    AssumeRolePolicyDocument: getAssumeRolePolicyMatcher(xaBucketName, [
      accessorAwsId,
    ]),
  });

  accessorTemplate.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: PYTHON_RUNTIME,
  });
  accessorTemplate.hasResourceProperties("AWS::IAM::Role", {
    RoleName: `${xaBucketName}-xa-mgmt-ex`,
    Policies: getPoliciesMatcher(xaBucketName, accessedAwsId),
  });
  accessorTemplate.hasResourceProperties("Custom::AWS", {});
});
