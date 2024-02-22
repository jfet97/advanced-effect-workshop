import { Effect } from "effect"
// import { setTime } from "effect/TestClock"

// Exercise Summary:
//
// The following exercise will explore how we can utilize the `Effect.async*`
// family of constructors to import asynchronous callbacks into an Effect. You will
// need to implement a `sleep` function which suspends a fiber for the specified
// number of milliseconds before resuming execution.

export const MAX_SET_TIMEOUT_MILLIS = 2 ** 31 - 1

const sleep = (millis: number) =>
  Effect.async<void, never>((resume) => {
    const tid = setTimeout(() => resume(Effect.unit), Math.min(millis, MAX_SET_TIMEOUT_MILLIS))
    return Effect.sync(() => (console.log("INTERRUPTED"), clearTimeout(tid))) // <-- "cleanup" if interrupted: clear the timeout
    // no cleanup if error that must be manually handled, just for interruption
  })

// Implement the logic to suspend the fiber for the specified number of
// milliseconds before allowing execution to resume. Your implementation should:
//   - utilize `setTimeout` to implement the delay
//   - utilize the `Effect.async*` combinators to handle the `setTimeout` callback
// Bonus:
//   - for bonus points, your implementation should also properly handle if the
//     fiber that is sleeping is interrupted

const program = Effect.gen(function*($) {
  const millis = 1_000
  yield* $(Effect.log(`Sleeping for ${millis} milliseconds...`))
  yield* $(sleep(millis), Effect.timeout(millis - 100), Effect.fork) // fork the sleep, set a timeout after which the sleep is interrupted
  yield* $(Effect.yieldNow()) // <-- to be sure the forked fiber runs
  yield* $(Effect.log("Resuming execution!"))
})

program.pipe(
  Effect.tapErrorCause(Effect.logError),
  Effect.runFork
)
