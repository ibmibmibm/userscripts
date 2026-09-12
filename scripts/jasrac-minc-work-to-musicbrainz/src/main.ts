declare const __VERSION__: string;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";
