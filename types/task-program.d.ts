declare module "virtual:task-program" {
  const source: string;
  export default source;
}
declare module "virtual:task-resources" {
  const resources: Record<string, string>;
  export default resources;
}

declare module "virtual:rsi-cases" {
  const suite: {
    version: number;
    inner: string[];
    outer: string[];
    heldOutFromReflection: string[];
    request: string;
    materials: Record<string, string>;
  };
  export default suite;
}
