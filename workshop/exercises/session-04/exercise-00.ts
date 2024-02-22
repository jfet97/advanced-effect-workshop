import {
  Chunk,
  Console,
  Effect,
  FiberRef,
  HashSet,
  Layer,
  Logger,
  Queue,
  Runtime,
  Schedule
} from "effect"
import type { DurationInput } from "effect/Duration"

// Exercise Summary:
//
// The following exercise will explore how we can create custom `Logger`s with
// Effect. We are going to alter the behavior of logging in our application by
// creating a `BatchedLogger` which batches logs and emits them as a collection
// after a fixed window.
//
// Your task will be to complete the implementation of `makeBatchedLogger`. The
// only code provided to you is the addition of the custom logger to the logger
// set of the application.

const makeBatchedLogger = (config: {
  readonly window: DurationInput
}) =>
  Effect.gen(function*($) {
    // in this case an array would have been enough
    const buffer = yield* $(Queue.unbounded<Logger.Logger.Options<unknown>>())

    // so we do not lose the context
    const runtime = yield* $(Effect.runtime())

    const logger: Logger.Logger<unknown, void> = Logger.make((log) => {
      Runtime.runPromise(runtime)(buffer.offer(log))
    })

    yield* $(
      Effect.gen(function*($) {
        const logs = yield* $(buffer.takeAll)
        Chunk.toReadonlyArray(logs).forEach(console.log)
      }).pipe(
        Effect.schedule(Schedule.fixed(config.window)),
        Effect.fork // usually it's better to user Effect.forkScoped
        // make sure this fiber can be interrupted with Effect.interruptible
        // so that it won't inherit the interrupt status of the parent fiber
      )
    )

    // when the scope is closed, the logger will be deleted
    yield* $(Effect.locallyScopedWith(FiberRef.currentLoggers, HashSet.add(logger)))
  })

const schedule = Schedule.fixed("500 millis").pipe(Schedule.compose(Schedule.recurs(10)))

const program = Effect.gen(function*($) {
  yield* $(Console.log("Running logs!"))
  yield* $(Effect.logInfo("Info log"))
  yield* $(Effect.logWarning("Warning log"))
  yield* $(Effect.logError("Error log"))
}).pipe(Effect.schedule(schedule))

const BatchedLoggerLive = Layer.scopedDiscard(makeBatchedLogger({ window: "2 seconds" }))

const MainLive = Logger.remove(Logger.defaultLogger).pipe(
  Layer.merge(BatchedLoggerLive)
)

program.pipe(
  Effect.provide(MainLive),
  Effect.runFork
)
