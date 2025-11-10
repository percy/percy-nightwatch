import { SnapshotOptions } from '@percy/core';
import { NightwatchAPI, NightwatchCustomCommands } from 'nightwatch';

export type PercyRegionAlgorithm = 'standard' | 'layout' | 'ignore' | 'intelliignore';

export interface PercyRegionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PercyRegionPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface PercyRegionSelector {
  boundingBox?: PercyRegionBoundingBox;
  elementXpath?: string;
  elementCSS?: string;
}

export interface PercyRegionConfiguration {
  diffSensitivity?: number;
  imageIgnoreThreshold?: number;
  carouselsEnabled?: boolean;
  bannersEnabled?: boolean;
  adsEnabled?: boolean;
}

export interface PercyRegionAssertion {
  diffIgnoreThreshold?: number;
}

export interface PercyRegion {
  algorithm: PercyRegionAlgorithm;
  elementSelector?: PercyRegionSelector;
  padding?: PercyRegionPadding;
  configuration?: PercyRegionConfiguration;
  assertion?: PercyRegionAssertion;
}

export interface CreateRegionOptions extends PercyRegionSelector {
  padding?: PercyRegionPadding;
  algorithm?: PercyRegionAlgorithm;
  diffSensitivity?: number;
  imageIgnoreThreshold?: number;
  carouselsEnabled?: boolean;
  bannersEnabled?: boolean;
  adsEnabled?: boolean;
  diffIgnoreThreshold?: number;
}

export type CreateRegion = (options?: CreateRegionOptions) => PercyRegion;

export interface PercyNightwatchExports {
  path: string;
  createRegion: CreateRegion;
}

declare const percyNightwatch: PercyNightwatchExports;
export default percyNightwatch;

declare module 'nightwatch' {
  interface NightwatchCustomCommands {
    percySnapshot(
      this: NightwatchAPI,
      name?: string,
      options?: SnapshotOptions
    ): this;
  }
}
