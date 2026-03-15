import { EventEmitter } from "events";

const docEvents = new EventEmitter();
docEvents.setMaxListeners(100);

export { docEvents };
