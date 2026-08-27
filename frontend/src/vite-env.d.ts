/// <reference types="vite/client" />

declare module '*.html?raw' {
  const content: string;
  export default content;
}

declare module 'turndown' {
  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    use(plugin: (service: TurndownService) => void): TurndownService;
    turndown(html: string | HTMLElement): string;
  }
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export function gfm(service: TurndownService): void;
}
