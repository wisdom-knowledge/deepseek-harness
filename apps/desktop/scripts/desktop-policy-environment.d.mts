/** Required deployment-selected metadata for mandatory-update policy requests. */
export interface DesktopPolicyEnvironment {
  origin: string
  allowedPageOrigins: string[]
  allowedAuthOrigins?: string[]
  authentication: 'anonymous' | 'feishu-test'
  [key: string]: unknown
}

/**
 * Resolve policy settings before artifact preparation or signing.
 * @param environment File-owned release settings; only the selected origin is required.
 * @param platform Target platform used to select local package behavior.
 * @param unsigned Whether the package is built without release signing.
 * @returns Policy metadata, or undefined for local macOS and internal Windows expert packages built without release signing.
 */
export function resolveDesktopPolicyEnvironment(environment: NodeJS.ProcessEnv): DesktopPolicyEnvironment
export function resolveDesktopPolicyEnvironment(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform, unsigned?: boolean): DesktopPolicyEnvironment | undefined
