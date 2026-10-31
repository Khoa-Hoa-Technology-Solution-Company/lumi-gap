import { EventEmitter } from "node:events";

export const manuscriptEvents = new EventEmitter();
manuscriptEvents.setMaxListeners(100);

