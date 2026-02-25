import { EventEmitter } from "events";

const fileEvents = new EventEmitter();
fileEvents.setMaxListeners(100);

export { fileEvents };
