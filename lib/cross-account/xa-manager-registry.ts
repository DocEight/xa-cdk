// Sveltekit-style state manager

import { Stack } from "aws-cdk-lib";

interface Access {
  accessorIdentifier: string;
  targetIdentifier: string;
  permissions: string[];
}
interface ConsumptionStatus {
  targetIdentifier: string;
  consumed: boolean;
}

// A map of Function (manager Construct constuctor) -> cloudfrontAccessors array (set to false if consumed)
type Registry<T> = Map<Function, T[]>;
const ensureRegistry = <T>(
  registry: WeakMap<Stack, Registry<T>>,
  stack: Stack,
  manager: Function,
) => {
  if (!registry.has(stack)) registry.set(stack, new Map());
  const stackRegistry = registry.get(stack)!;
  if (!stackRegistry.has(manager)) stackRegistry.set(manager, []);
  return stackRegistry.get(manager)!;
};

interface RegistryManagementBaseProps {
  stack: Stack;
  manager: Function;
  targetIdentifier: string;
}

// A map of Stack instance -> Function (manager Construct constuctor) -> cloudfrontAccessors array
const cloudfrontRegistries = new WeakMap<Stack, Registry<Access>>();

// A map of Stack instance -> Function (manager Construct constuctor) -> ConsumptionStatus array
const consumptionRegistries = new WeakMap<Stack, Registry<ConsumptionStatus>>();

interface IsConsumedProps extends RegistryManagementBaseProps {}

// Checks if the given resource manager for the given stack has been consumed
const isConsumed = (props: IsConsumedProps) =>
  consumptionRegistries
    .get(props.stack)
    ?.get(props.manager)
    ?.find((r) => r.targetIdentifier == props.targetIdentifier)?.consumed ??
  false;

export interface ConsumeCloudfrontAccessorsProps
  extends RegistryManagementBaseProps {}

// Consume the cloudfrontAccessors for the provided manager construct of the given stack
export const consumeCloudfrontAccessors = (
  props: ConsumeCloudfrontAccessorsProps,
) => {
  const { stack, manager, targetIdentifier } = props;
  if (isConsumed({ stack, manager, targetIdentifier }))
    throw new Error(
      `Manager for ${targetIdentifier} has already been consumed.`,
    );
  ensureRegistry(consumptionRegistries, stack, manager).push({
    targetIdentifier,
    consumed: true,
  });
  return ensureRegistry(cloudfrontRegistries, stack, manager).filter(
    (r) => r.targetIdentifier == targetIdentifier,
  );
};

export interface RegisterCloudfrontAccessorProps
  extends RegistryManagementBaseProps {
  distributionId: string;
  actions: string[];
}

// Manager functions that call this should specify a default list of actions for ergonomics
export const registerCloudfrontAccessor = (
  props: RegisterCloudfrontAccessorProps,
) => {
  const { stack, manager, targetIdentifier, distributionId, actions } = props;
  if (isConsumed({ stack, manager, targetIdentifier }))
    throw new Error(
      `Cannot register resources for ${targetIdentifier} manager after creation ` +
        `(registering ${distributionId}).`,
    );
  if (
    ensureRegistry(cloudfrontRegistries, stack, manager).find(
      (r) =>
        r.targetIdentifier == targetIdentifier &&
        r.accessorIdentifier == distributionId,
    )
  )
    throw new Error(
      `Distribution ${distributionId} has already been registered for ` +
        `${targetIdentifier} manager.`,
    );
  ensureRegistry(cloudfrontRegistries, stack, manager).push({
    accessorIdentifier: distributionId,
    targetIdentifier,
    permissions: actions,
  });
};
