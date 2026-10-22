// Cloudflare Worker entry: CORS for the app origin, Firebase ID-token check
// for the single owner, then forwards to the one AiBudget Durable Object.

import { DurableObject } from 'cloudflare:workers';
import { createVerifier } from './jwt.mjs';
import { AiService } from './service.mjs';
import { handle, serviceHandler } from './routes.mjs';

let verifier = null;
let verifierProject = null;

export default {
  async fetch(request, env) {
    if (!verifier || verifierProject !== env.FIREBASE_PROJECT_ID) {
      verifier = createVerifier({ projectId: env.FIREBASE_PROJECT_ID });
      verifierProject = env.FIREBASE_PROJECT_ID;
    }
    return handle(request, env, {
      verify: verifier,
      forward: (req) => env.AI_BUDGET.get(env.AI_BUDGET.idFromName('owner')).fetch(req),
    });
  },
};

export class AiBudget extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.service = new AiService({ storage: ctx.storage, env, log: (m) => console.warn(m) });
  }

  async fetch(request) {
    return serviceHandler(this.service, request);
  }
}
