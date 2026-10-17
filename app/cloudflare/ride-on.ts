import { WorkerEntrypoint } from 'cloudflare:workers'
import { createRuntime } from '../../worker.ts'
import { withRuntime } from '../data/runtime.ts'
import { rideOnRequest } from '../data/ride-on.ts'

/** Private service binding; Strava tokens never leave the Stitch backend. */
export class RideOnStrava extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    return withRuntime(createRuntime(this.env), () => rideOnRequest(request))
  }
}
