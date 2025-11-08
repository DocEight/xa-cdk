import { Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

import {
  ConsumeCloudfrontAccessorsProps,
  RegisterCloudfrontAccessorProps,
} from "./xa-manager-registry";
import * as registry from "./xa-manager-registry";

export interface AllowCloudfrontBaseProps {
  scope: Construct;
  distributionId: string;
  actions?: string[];
}

export interface CrossAccountManagerProps {
  resourceIdentifier: string;
  xaAwsId: string;
  managerTimeout?: number;
  callerTimeout?: number;
  subclassDir: string;
}

export abstract class CrossAccountManager extends Construct {
  /**
   * The Lambda Function that will be called to assume a role cross-account and
   * manage the resource
   */
  private mgrFunction: lambda.Function;
  public get function(): lambda.Function {
    return this.mgrFunction;
  }

  /**
   * Given a stack, subclass constructor, and a resource identifier, returns
   * the mapping of accessor resource IDs to the permissions they need.
   */
  private static consumeCloudfrontAccessors(
    props: ConsumeCloudfrontAccessorsProps,
  ) {
    const accessInfo = registry.consumeCloudfrontAccessors(props);
    const accessors: { [accessor: string]: string[] } = {};
    for (const access of accessInfo) {
      accessors[access.accessorIdentifier] = access.permissions;
    }
    return accessors;
  }

  constructor(scope: Construct, id: string, props: CrossAccountManagerProps) {
    super(scope, id);

    const {
      resourceIdentifier,
      xaAwsId,
      managerTimeout = 30, // default timeout of 3 seconds is awful short/fragile
      callerTimeout = 30, // default timeout of 3 seconds is awful short/fragile
      subclassDir,
    } = props;

    const xaMgmtRoleArn = `arn:aws:iam::${xaAwsId}:role/${resourceIdentifier}-xa-mgmt`;
    const assumeXaMgmtRolePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sts:AssumeRole"],
          resources: [xaMgmtRoleArn],
        }),
      ],
    });

    // Manager Lambda execution role
    const role = new iam.Role(this, "xa-mgmt-lambda-role", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Execution role for ${resourceIdentifier} manager Lambda function.`,
      inlinePolicies: {
        assumeXaMgmtRolePolicy,
      },
      roleName: `${resourceIdentifier}-xa-mgmt-ex`,
    });

    // Manager Lambda
    this.mgrFunction = new lambda.Function(this, "xa-mgmt-lambda", {
      code: lambda.Code.fromAsset(subclassDir),
      handler: "main.handler",
      runtime: lambda.Runtime.PYTHON_3_13,
      timeout: Duration.seconds(managerTimeout),
      environment: {
        XA_MGMT_ROLE_ARN: xaMgmtRoleArn,
        RESOURCE_ID: resourceIdentifier,
        ACCESSOR_ACCOUNT_ID: Stack.of(this).account,
        ACCESSOR_STACK_NAME: Stack.of(this).stackName,
      },
      role,
    });

    // Get the Cloudfront IDs and their permissions for this subclass from the
    // Registries
    const stack = Stack.of(this);
    const manager = this.constructor;
    const cloudfrontAccessors = CrossAccountManager.consumeCloudfrontAccessors({
      stack,
      manager,
      targetIdentifier: resourceIdentifier,
    });

    // Util factory to get an AwsSdkCall for the AwsCustomResource
    const callFor = (operation: string) => {
      return {
        physicalResourceId: PhysicalResourceId.of("xa-mgmt-lambda-caller"),
        service: "Lambda",
        action: "InvokeFunction",
        parameters: {
          FunctionName: this.function.functionName,
          InvocationType: "Event",
          Payload: JSON.stringify({
            operation,
            cloudfrontAccessors,
          }),
        },
      };
    };

    new AwsCustomResource(this, "xa-mgmt-lambda-caller", {
      onCreate: callFor("create"),
      onUpdate: callFor("update"),
      onDelete: callFor("delete"),
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.function.functionArn],
      }),
      timeout: Duration.seconds(callerTimeout),
    });
  }

  /**
   * Grant access to the given cross-account resource to the specified Cloudfront
   * Distribution ID
   * Should be implemented by the child class, passing the subclass's constructor and
   * specifying a default list of actions
   */
  protected static registerCloudfrontAccessor(
    props: RegisterCloudfrontAccessorProps,
  ) {
    registry.registerCloudfrontAccessor(props);
  }
}
