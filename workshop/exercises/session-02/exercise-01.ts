import { Chunk, Effect, Queue, ReadonlyArray, Schedule } from "effect"

// Exercise Summary:
//
// The following exercise will explore how we can distribute work between
// multiple fibers using Queue. We will create three separate implementations
// of "workers" that take a value from a Queue and perform some work on the
// value.

// The below function simulates performing some non-trivial work
export const doSomeWork = (value: number) =>
  Effect.log(`Consuming value '${value}'`).pipe(
    Effect.delay("20 millis")
  )

const program = Effect.gen(function*(_) {
  // The following will offer the numbers [0-100] to the Queue every second
  const queue = yield* _(Queue.unbounded<number>())
  yield* _(
    Queue.offerAll(queue, ReadonlyArray.range(0, 100)),
    Effect.schedule(Schedule.fixed("1 seconds")),
    Effect.fork
  )
  // Implementation #1 - Sequential
  yield* _(
    // Implement an Effect pipeline which continuously takes from the Queue
    // and calls `doSomeWork` on the taken value. Your implementation should
    // perform work on each taken value sequentially.
    Queue.take(queue),
    Effect.flatMap((v) => doSomeWork(v)),
    Effect.forever,
    Effect.annotateLogs("concurrency", "none"),
    Effect.fork
  )
  // Implementation #2 - Unbounded Concurrency
  yield* _(
    // Implement an Effect pipeline which continuously takes from the Queue
    // and calls `doSomeWork` on the taken value. Your implementation should
    // perform work on each taken value with unbounded concurrency.
    Queue.takeBetween(1, 100)(queue), // take between avoid running when the queue is empty
    Effect.flatMap((vs) =>
      Effect.all(
        Chunk
          .toReadonlyArray(vs)
          .map(doSomeWork),
        { concurrency: "unbounded" }
      )
    ),
    Effect.fork, // I do not wait for the computation that handles the taken values to finish
    Effect.forever,
    Effect.annotateLogs("concurrency", "unbounded"),
    Effect.fork
  )
  // Implementation #3 - Bounded Concurrency
  const concurrencyLimit = 4
  yield* _(
    Queue.takeBetween(1, 100)(queue), // take between avoid running when the queue is empty
    Effect.flatMap((vs) =>
      Effect.all(
        Chunk
          .toReadonlyArray(vs)
          .map(doSomeWork),
        { concurrency: concurrencyLimit }
      )
    ),
    Effect.fork, // I do not wait for the computation that handles the taken values to finish
    // problem, the forks are not bounded (see official solution)
    Effect.forever,
    // Implement an Effect pipeline which continuously takes from the Queue
    // and calls `doSomeWork` on the taken value. Your implementation should
    // perform work on each taken value with concurrency bounded to the above
    // concurrency limit.
    Effect.annotateLogs("concurrency", "bounded"),
    Effect.fork
  )
})

program.pipe(
  Effect.awaitAllChildren,
  Effect.tapErrorCause(Effect.logError),
  Effect.runFork
)
