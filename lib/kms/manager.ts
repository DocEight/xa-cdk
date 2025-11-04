import { Duration, Stack } from "aws-cdk-lib";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import path from "path";
import { CrossAccountManager } from "../cross-account";

interface Registry {
  [key: string]: Set<string> | false;
}

export interface CrossAccountKmsKeyManagerProps {
  xaKeyId: string;
  xaAwsId: string;
  managerTimeout?: number;
  callerTimeout?: number;
}

/**
 * CrossAccountKmsKeyManager creates a Lambda function and calls it at deployment
 * time using an AwsCustomResource (Lambda:InvokeFunction).
 *
 * @remarks
 * - `xaKeyId` should be the ID of the KMS key in the other account whose
 *   policy we want to manage.
 * - `xaAwsId` should be the ID of the AWS account the aforementioned key
 *   belongs to.
 * - `managerTimeout` is optional and specifies the number of seconds for the manager
 *   Lambda Function's timeout (defaults to 30).
 * - `callerTimeout` is optional and specifies the number of seconds for the
 *   AwsCustomResource's timeout (defaults to 30).
 * - To use this construct, first register the resources that need to access a given
 *   KMS key using one of the following static registry functions:
 *   - allowCloudfront(keyId, cloudfrontId)
 */
export class CrossAccountKmsKeyManager extends CrossAccountManager {
  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountKmsKeyManagerProps,
  ) {
    const {
      xaKeyId,
      xaAwsId,
      managerTimeout,
      callerTimeout, // default timeout of 3 seconds is awful short/fragile
    } = props;
    super(scope, id, {
      resourceIdentifier: xaKeyId,
      xaAwsId,
      managerTimeout,
      callerTimeout,
    });
  }

  /**
   * Grant access to the given cross-account KMS key to the specified Cloudfront
   * Distribution ID
   * Optionally specify a list of actions
   * (default: [
   *  "kms:Decrypt",
   *  "kms:Encrypt",
   *  "kms:GenerateDataKey*",
   *  "kms:DescribeKey"
   * ])
   */
  public static allowCloudfront(
    context: Construct,
    keyId: string,
    cloudfrontId: string,
    actions?: string[],
  ) {
    actions ??= [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ];
    const stack = Stack.of(context);
    const caller = this;
    actions ??= ["s3:GetObject"];
    super.registerCloudfrontAccessor(
      stack,
      caller,
      keyId,
      cloudfrontId,
      actions,
    );
  }
}
