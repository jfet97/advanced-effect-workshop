import * as Schema from "@effect/schema/Schema"
import bodyParser from "body-parser"
import {
  Cause,
  Context,
  Effect,
  FiberSet,
  HashMap,
  Layer,
  Option,
  ReadonlyArray,
  Ref,
  Runtime
} from "effect"
import express from "express"

// =============================================================================
// Server
// =============================================================================

const ServerLive = Layer.scopedDiscard(
  Effect.gen(function*(_) {
    const port = 8888
    const app = yield* _(Express)
    const runtime = yield* _(Effect.runtime<never>())
    const runFork = Runtime.runFork(runtime)
    yield* _(
      Effect.acquireRelease(
        Effect.sync(() =>
          app.listen(port, () => {
            runFork(Effect.log(`Server listening for requests on port: ${port}`))
          })
        ),
        (server) => Effect.sync(() => server.close())
      )
    )
  })
)

// =============================================================================
// Routes
// =============================================================================

// Layer.scopedDiscard just to ease stuff up
const GetTodoRouteLive = Layer.scopedDiscard(Effect.gen(function*(_) {
  const app = yield* _(Express)
  const runFork = yield* _(FiberSet.makeRuntime<TodoRepository>()) // would be ok to use `Effect.runtime` here, FiberSet handles scope, interruptions etc (?)
  app.get("/todos/:id", (req, res) => {
    const id = req.params.id
    const program = TodoRepository.pipe(
      Effect.flatMap((repo) => repo.getTodo(Number(id))),
      Effect.flatMap(Option.match({
        onNone: () => Effect.sync(() => res.status(404).json(`Todo ${id} not found`)),
        onSome: (todo) => Effect.sync(() => res.json(todo))
      })),
      Effect.asUnit
    )
    runFork(program)
  })
}))

const GetAllTodosRouteLive = Layer.scopedDiscard(Effect.gen(function*(_) {
}))

const CreateTodoRouteLive = Layer.scopedDiscard(Effect.gen(function*(_) {
}))

const UpdateTodoRouteLive = Layer.scopedDiscard(Effect.gen(function*(_) {
}))

const DeleteTodoRouteLive = Layer.scopedDiscard(Effect.gen(function*(_) {
}))

// =============================================================================
// Todo
// =============================================================================

class Todo extends Schema.Class<Todo>()({
  id: Schema.number,
  title: Schema.string,
  completed: Schema.boolean
}) {}

const CreateTodoParams = Todo.struct.pipe(Schema.omit("id"))
type CreateTodoParams = Schema.Schema.To<typeof CreateTodoParams>

const UpdateTodoParams = Schema.partial(Todo.struct, { exact: true }).pipe(Schema.omit("id"))
type UpdateTodoParams = Schema.Schema.To<typeof UpdateTodoParams>

// =============================================================================
// TodoRepository
// =============================================================================

const makeTodoRepository = Effect.gen(function*(_) {
  const nextIdRef = yield* _(Ref.make(0))
  const todosRef = yield* _(Ref.make(HashMap.empty<number, Todo>()))

  const getTodo = (id: number): Effect.Effect<Option.Option<Todo>> =>
    Ref.get(todosRef).pipe(Effect.map(HashMap.get(id)))

  const getTodos: Effect.Effect<ReadonlyArray<Todo>> = Ref.get(todosRef).pipe(
    Effect.map((map) => ReadonlyArray.fromIterable(HashMap.values(map)))
  )

  const createTodo = (params: CreateTodoParams): Effect.Effect<number> =>
    Ref.getAndUpdate(nextIdRef, (n) => n + 1).pipe(
      Effect.flatMap((id) =>
        Ref.modify(todosRef, (map) => {
          const newTodo = new Todo({ ...params, id })
          const updated = HashMap.set(map, newTodo.id, newTodo)
          return [newTodo.id, updated]
        })
      )
    )

  const updateTodo = (
    id: number,
    params: UpdateTodoParams
  ): Effect.Effect<Todo, Cause.NoSuchElementException> =>
    Ref.get(todosRef).pipe(Effect.flatMap((map) => {
      const maybeTodo = HashMap.get(map, id)
      if (Option.isNone(maybeTodo)) {
        return Effect.fail(new Cause.NoSuchElementException())
      }
      const newTodo = new Todo({ ...maybeTodo.value, ...params })
      const updated = HashMap.set(map, id, newTodo)
      return Ref.set(todosRef, updated).pipe(Effect.as(newTodo))
    }))

  const deleteTodo = (id: number): Effect.Effect<boolean> =>
    Ref.get(todosRef).pipe(Effect.flatMap((map) =>
      HashMap.has(map, id)
        ? Ref.set(todosRef, HashMap.remove(map, id)).pipe(Effect.as(true))
        : Effect.succeed(false)
    ))

  return {
    getTodo,
    getTodos,
    createTodo,
    updateTodo,
    deleteTodo
  } as const
})

class TodoRepository extends Context.Tag("TodoRepository")<
  TodoRepository,
  Effect.Effect.Success<typeof makeTodoRepository>
>() {
  static readonly Live = Layer.effect(TodoRepository, makeTodoRepository)
}

// =============================================================================
// Express
// =============================================================================

class Express extends Context.Tag("Express")<Express, ReturnType<typeof express>>() {
  static readonly Live = Layer.sync(Express, () => {
    const app = express()
    app.use(bodyParser.json())
    return app
  })
}

// =============================================================================
// Program
// =============================================================================

const MainLive = ServerLive.pipe(
  Layer.merge(GetTodoRouteLive),
  Layer.merge(GetAllTodosRouteLive),
  Layer.merge(CreateTodoRouteLive),
  Layer.merge(UpdateTodoRouteLive),
  Layer.merge(DeleteTodoRouteLive),
  Layer.provide(Express.Live),
  Layer.provide(TodoRepository.Live)
)

Layer.launch(MainLive).pipe(
  Effect.tapErrorCause(Effect.logError),
  Effect.runFork
)
