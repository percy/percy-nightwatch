import fs = require('fs')
import { clientInfo } from './environment'
const { agentJsFilename, isAgentRunning, postSnapshot } = require('@percy/agent/dist/utils/sdk-utils')
declare var PercyAgent: any

/**
 * A custom Nightwatch command to take a Percy snapshot. To install in your Nightwatch tests,
 * add the path to this module to the 'custom_commands_path' array in your Nightwatch configuration. See
 * documentation for 'path' on this module for an example of how to do that.
 *
 * Once installed, the command will be available as 'percySnapshot(...)'.
 *
 * @param name Name of the snapshot that we're taking. If omitted, will use the name of the current test.
 * @param options Additional options, e.g. '{widths: [768, 992, 1200]}'. Optional.
 */
export function command(this: any, name: string, options: any = {}) {
  name = name || this.currentTest.name

  this.execute(fs.readFileSync(agentJsFilename()).toString())

  return isAgentRunning().then((canSnapshot: boolean) => {
    if(!canSnapshot) { return }

    return this.execute(
      (name: string, options: any, clientInfo: string) => {
        const percyAgentClient = new PercyAgent({ clientInfo, handleAgentCommunication: false })

        return {
          dom: percyAgentClient.snapshot(name, options),
          url: window.location.href
        }
      },
      [name, options, clientInfo()],
      (browserReturn: any) => {
        return postSnapshot({
          name,
          url: browserReturn.value.url,
          domSnapshot: browserReturn.value.dom,
          clientInfo: clientInfo(),
          ...options
        })
      }
    )
  })
}

/**
 * Path to this module's directory. Add to the 'custom_commands_path' array in your
 * Nightwatch configuration:
 *
 * const percy = require('@percy/nightwatch')
 *
 * module.exports = {
 *   [...your nightwatch configuration...]
 *   custom_commands_path: [ percy.path ],
 * }
 */
export const path: string = __dirname
