import { SnapshotOptions } from '@percy/core';
import { NightwatchAPI, NightwatchCustomCommands } from 'nightwatch';

declare module 'nightwatch' {
  interface NightwatchCustomCommands {
    percySnapshot(
      this: NightwatchAPI,
      name?: string,
      options?: SnapshotOptions
    ): this
  }
}
