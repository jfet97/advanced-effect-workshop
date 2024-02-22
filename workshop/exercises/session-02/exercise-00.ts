import { Console, Deferred, Effect, Random } from "effect"

// Exercise Summary:
//
// The following exercise will explore how we can utilize a Deferred to
// propagate the result of an Effect between fibers. Your implementation
// should have the same semantics as the `Effect.intoDeferred` combinator, but
// it should NOT utilize said combinator.

const maybeFail = Random.next.pipe(Effect.filterOrFail(
  (n) => n > 0.5,
  (n) => `Failed with ${n}`
))

const program = Effect.gen(function*(_) {
  const deferred = yield* _(Deferred.make<number, string>())
  yield* _(
    maybeFail,
    // or Effect.matchEffect but defects are not handled (use matchCauseEffect)
    // but we have to handle interruptions (see the official solution) otherwise the deferred
    // may never be completed, we have to propagate the interruption signal to the parent
    Effect.flatMap((n) => Deferred.succeed(deferred, n)),
    Effect.catchAll((e) => Deferred.fail(deferred, e)),
    Effect.fork
  )
  const result = yield* _(Deferred.await(deferred))
  yield* _(Console.log(result))
})

program.pipe(
  Effect.tapErrorCause(Effect.logError),
  Effect.runFork
)
