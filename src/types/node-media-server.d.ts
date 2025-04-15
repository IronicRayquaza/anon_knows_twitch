declare module 'node-media-server' {
  interface Session {
    id: string;
    streamPath: string;
    startTime: Date;
    ip: string;
    connectTime: Date;
  }

  export default class NodeMediaServer {
    constructor(config: any);
    run(): void;
    getSessions(): Record<string, Session>;
    on(event: string, callback: (id: string, StreamPath: string, args: any) => void): void;
  }
} 