import { AsyncLocalStorage } from 'node:async_hooks'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import {
  install,
  DANGEROUSLY_runPendingImmediatesAfterCurrentTask,
  expectNoPendingImmediates,
} from './fast-set-immediate.external'

install()

function createLogger() {
  const logs: string[] = []

  const log = (...args: any[]) => {
    const { inspect } = require('node:util') as typeof import('node:util')
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')

    let logLine = args
      .map((arg) =>
        typeof arg === 'string' ? arg : inspect(arg, { colors: true })
      )
      .join(' ')

    logs.push(logLine)
    writeFileSync(process.stdout.fd, logLine + '\n')
  }
  return { logs, log }
}

it('runs immediates after each task', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1')
      process.nextTick(() => {
        log('timeout 1 -> immediate 1 -> nextTick 1')
        queueMicrotask(() => {
          log('timeout 1 -> immediate 1 -> nextTick 1 -> microtask 1')
        })
        queueMicrotask(() => {
          process.nextTick(() => {
            log(
              'timeout 1 -> immediate 1 -> nextTick 1 -> microtask 2 -> nextTick'
            )
          })
        })
      })
    })
    setImmediate(() => {
      log('timeout 1 -> immediate 2')
    })
    process.nextTick(() => {
      log('timeout 1 -> nextTick 1')
      queueMicrotask(() => {
        log('timeout 1 -> nextTick 1 -> microtask 1')
      })
      queueMicrotask(() => {
        process.nextTick(() => {
          log('timeout 1 -> nextTick 1 -> microtask 2 -> nextTick')
        })
      })
      process.nextTick(() => {
        log('timeout 1 -> nextTick 1 -> nextTick 1')
      })
    })
  })

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 2')
    setImmediate(() => {
      log('timeout 2 -> immediate 1')
      setImmediate(() => {
        log('timeout 2 -> immediate 1 -> immediate 1')
      })
    })
  })

  setTimeout(() => {
    log('timeout 3')
    try {
      expectNoPendingImmediates()
      done.resolve()
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    'timeout 1 -> nextTick 1',
    'timeout 1 -> nextTick 1 -> nextTick 1',
    'timeout 1 -> nextTick 1 -> microtask 1',
    'timeout 1 -> nextTick 1 -> microtask 2 -> nextTick',
    // ======================
    'timeout 1 -> immediate 1',
    'timeout 1 -> immediate 1 -> nextTick 1',
    'timeout 1 -> immediate 1 -> nextTick 1 -> microtask 1',
    'timeout 1 -> immediate 1 -> nextTick 1 -> microtask 2 -> nextTick',
    // ======================
    'timeout 1 -> immediate 2',
    // ===================================
    'timeout 2',
    // ======================
    'timeout 2 -> immediate 1',
    // ======================
    'timeout 2 -> immediate 1 -> immediate 1',
    // ===================================
    'timeout 3',
  ])
})

it('only affects the task it is called in', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1 (fast)')
      setImmediate(() => {
        log('timeout 1 -> immediate 1 (fast) -> immediate 1 (fast)')
      })
    })
  })

  setTimeout(() => {
    log('timeout 2')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }

    setImmediate(() => {
      log('timeout 2 -> immediate 1 (slow)')
      done.resolve()
    })
  })

  setTimeout(() => {
    log('timeout 3')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    // ======================
    'timeout 1 -> immediate 1 (fast)',
    // ======================
    'timeout 1 -> immediate 1 (fast) -> immediate 1 (fast)',
    // ===================================
    'timeout 2',
    // ===================================
    'timeout 3',
    // ======================
    'timeout 2 -> immediate 1 (slow)',
  ])
})

it('does not run immediates scheduled before it was called', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    log('timeout 1')

    setImmediate(() => {
      log('timeout 1 -> immediate 1 (slow)')
      done.resolve()
    })

    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    setImmediate(() => {
      log('timeout 1 -> immediate 2 (fast)')
    })
  })

  setTimeout(() => {
    log('timeout 2')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    // ======================
    'timeout 1 -> immediate 2 (fast)',
    // ===================================
    'timeout 2',
    // ======================
    'timeout 1 -> immediate 1 (slow)',
  ])
})

it('runs immediates scheduled in nextTick', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    process.nextTick(() => {
      setImmediate(() => {
        log('timeout 1 -> nextTick -> immediate 1')
        process.nextTick(() => {
          setImmediate(() => {
            log(
              'timeout 1 -> nextTick -> immediate 1 -> nextTick -> immediate 1'
            )
          })
        })
      })
    })
  })

  setTimeout(() => {
    log('timeout 2')
    try {
      expectNoPendingImmediates()
      done.resolve()
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    // ======================
    'timeout 1 -> nextTick -> immediate 1',
    // ======================
    'timeout 1 -> nextTick -> immediate 1 -> nextTick -> immediate 1',
    // ===================================
    'timeout 2',
  ])
})

it('runs ticks and microtasks from immediates before moving onto the next task', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1')
      queueMicrotask(() => {
        log('timeout 1 -> immediate 1 -> microtask 1')
        queueMicrotask(() => {
          log('timeout 1 -> immediate 1 -> microtask 1 -> microtask 1')
        })
        process.nextTick(() => {
          log('timeout 1 -> immediate 1 -> microtask 1 -> nextTick')
        })
      })
      process.nextTick(() => {
        log('timeout 1 -> immediate 1 -> nextTick')
      })
    })
  })

  setTimeout(() => {
    log('timeout 2')
    try {
      expectNoPendingImmediates()
      done.resolve()
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    // ======================
    'timeout 1 -> immediate 1',
    'timeout 1 -> immediate 1 -> nextTick',
    'timeout 1 -> immediate 1 -> microtask 1',
    'timeout 1 -> immediate 1 -> microtask 1 -> microtask 1',
    'timeout 1 -> immediate 1 -> microtask 1 -> nextTick',
    // ===================================
    'timeout 2',
  ])
})

describe('alternate sources of immediates', () => {
  it('promisify(setImmediate)', async () => {
    // `setImmediate` defines a `util.promisify.custom`, and so does our patch.
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      promisifiedSetImmediate().then(() => {
        log('timeout 1 -> immediate 1')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 2',
    ])
  })

  it('require("node:timers").setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const timers = require('node:timers') as typeof import('node:timers')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      timers.setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 2',
    ])
  })

  it('require("node:timers/promises").setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const timersPromises =
      require('node:timers/promises') as typeof import('node:timers/promises')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      timersPromises.setImmediate().then(() => {
        log('timeout 1 -> immediate 1')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 2',
    ])
  })
})

describe('async context propagation', () => {
  it('propagates AsyncLocalStorage to setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()
    const Ctx = new AsyncLocalStorage<string>()

    Ctx.run('outer', () => {
      setTimeout(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log(`timeout 1 :: ${Ctx.getStore()}`)
        setImmediate(() => {
          // The outer context should be readable here
          log(`timeout 1 -> immediate 1 :: ${Ctx.getStore()}`)
          // Shadow the outer context
          Ctx.run('inner', () => {
            setImmediate(() => {
              // The inner context should be readable here
              log(
                `timeout 1 -> immediate 1 -> immediate 1 :: ${Ctx.getStore()}`
              )
            })
          })
        })
      })
    })

    setTimeout(() => {
      // The context should not be readable here
      log(`timeout 2 :: ${Ctx.getStore()}`)
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1 :: outer',
      // ======================
      'timeout 1 -> immediate 1 :: outer',
      // ======================
      'timeout 1 -> immediate 1 -> immediate 1 :: inner',
      // ===================================
      'timeout 2 :: undefined',
    ])
  })

  it('does not break AsyncLocalStorage propagation in process.nextTick', async () => {
    // We don't alter the implementation of `process.nextTick` much,
    // but we do patch it, so as a sanity check it's worth verifying that
    // we're not breaking async context propagation.

    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()
    const Ctx = new AsyncLocalStorage<string>()

    Ctx.run('hello', () => {
      setTimeout(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        log(`timeout 1 :: ${Ctx.getStore()}`)
        process.nextTick(() => {
          // the context should be readable here
          log(`timeout 1 -> nextTick :: ${Ctx.getStore()}`)
        })
      })
    })

    setTimeout(() => {
      // The context should not be readable here
      log(`timeout 2 :: ${Ctx.getStore()}`)
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1 :: hello',
      // ======================
      'timeout 1 -> nextTick :: hello',
      // ===================================
      'timeout 2 :: undefined',
    ])
  })
})

describe('allows cancelling immediates', () => {
  it('synchronously', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
      const immediate2 = setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
      clearImmediate(immediate2)
    })

    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })

  it('from a nextTick', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
      const immediate2 = setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
      process.nextTick(() => {
        clearImmediate(immediate2)
      })
    })
    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })

  it('from another immediate', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
        clearImmediate(immediate2)
      })
      const immediate2 = setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })
    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })

  it('promisified - with an AbortSignal after creating', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    const abortError = new Error('Stop right there')
    let thrownOnAbort: unknown

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })

      const abortController = new AbortController()

      promisifiedSetImmediate(undefined, {
        signal: abortController.signal,
      }).then(
        () => {
          log('timeout 1 -> immediate 2')
        },
        (err) => {
          thrownOnAbort = err
        }
      )

      abortController.abort(abortError)
    })
    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
    expect(thrownOnAbort).toBe(abortError)
  })

  it('promisified - with an AbortSignal that was already aborted', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    const abortError = new Error('Stop right there')
    let thrownOnAbort: unknown

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })

      const abortController = new AbortController()
      abortController.abort(abortError)

      promisifiedSetImmediate(undefined, {
        signal: abortController.signal,
      }).then(
        () => {
          log('timeout 1 -> immediate 2')
        },
        (err) => {
          thrownOnAbort = err
        }
      )
    })
    setTimeout(() => {
      log('timeout 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
    expect(thrownOnAbort).toBe(abortError)
  })
})

describe('uncaught errors in setImmediate do not affect surrounding tasks or other immediates', () => {
  type TriggeredUncaught = {
    error: unknown
    kind: 'uncaughtException' | 'unhandledRejection'
  }

  const trackUncaughtErrors = (
    handler: (
      error: unknown,
      kind: 'uncaughtException' | 'unhandledRejection'
    ) => void
  ) => {
    // We have to use this instead of `process.on("uncaughtException")`,
    // because if an actual "uncaughtException" event fires, Jest will fail the test.
    const onUncaughtException = (err: unknown) => {
      handler(err, 'uncaughtException')
    }
    process.setUncaughtExceptionCaptureCallback(onUncaughtException)

    // If an unhandled rejection occurs, Jest will fail the test.
    // Here, we're triggering one deliberately, so we need to work around Jest's behavior.
    // This seems to be the best we can do, and there's no official solution:
    // https://github.com/jestjs/jest/issues/5620
    const prevListeners = process.rawListeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    const onUnhandledRejection = (err: unknown) => {
      handler(err, 'unhandledRejection')
    }
    process.on('unhandledRejection', onUnhandledRejection)

    return {
      [Symbol.dispose]() {
        process.setUncaughtExceptionCaptureCallback(null)

        process.off('unhandledRejection', onUnhandledRejection)
        for (const listener of prevListeners) {
          process.on(
            'unhandledRejection',
            listener as NodeJS.UnhandledRejectionListener
          )
        }
      },
    }
  }

  it('sync errors trigger uncaughtException', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      log(kind)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')

        // In the patch, we rethrow the synchronous error asynchronously,
        // so unfortunately ticks will run before uncaughtException.
        process.nextTick(() => {
          log('timeout 1 -> immediate 1 -> nextTick')
        })

        throw error
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      'timeout 1 -> immediate 1 -> nextTick', // undesirable
      'uncaughtException',
      // ======================
      'timeout 1 -> immediate 2',
      // ===================================
      'timeout 2',
    ])
  })

  it('sync errors in nextTick trigger uncaughtException', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      log(kind)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
        process.nextTick(() => {
          log('timeout 1 -> immediate 1 -> nextTick')
          throw error
        })
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      'timeout 1 -> immediate 1 -> nextTick',
      'uncaughtException',
      // ======================
      'timeout 1 -> immediate 2',
      // ===================================
      'timeout 2',
    ])
  })

  it('sync errors in nextTick before immediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      log(kind)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
      log('timeout 1')
      process.nextTick(() => {
        log('timeout 1 -> nextTick')
        throw error
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      'timeout 1 -> nextTick',
      'uncaughtException',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 1 -> immediate 2',
      // ===================================
      'timeout 2',
    ])
  })

  it('unhandled rejection', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      log(kind)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
        // uncaughtException
        // queueMicrotask(() => {
        //   log('timeout 1 -> immediate 1 -> microtask')
        //   throw error
        // })

        // uncaughtException
        // void (async () => {
        //   await Promise.resolve()
        //   throw error
        // })

        // unhandledRejection
        // Promise.reject(error)

        // unhandledRejection
        void Promise.resolve().then(() => {
          throw error
        })
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })

    setTimeout(() => {
      log('timeout 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'unhandledRejection' })

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',

      // // FIXME: we would like to observe the rejection here...
      // 'unhandledRejection',

      // ======================
      'timeout 1 -> immediate 2',

      // FIXME: ...but it happens here, after the second immediate:
      'unhandledRejection',

      // ===================================
      'timeout 2',
    ])
  })
})

describe('error recovery', () => {
  describe('when crashing, it bails out to native setImmediate and does not break subsequent calls', () => {
    const expectCorrectRunToWork = async () => {
      const { log, logs } = createLogger()
      const done = createPromiseWithResolvers<void>()

      setTimeout(() => {
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        } catch (err) {
          return done.reject(err)
        }

        log('timeout 1')

        setImmediate(() => {
          log('timeout 1 -> immediate 1')
        })
        setImmediate(() => {
          log('timeout 1 -> immediate 2')
        })
      })

      setTimeout(() => {
        log('timeout 2')

        try {
          expectNoPendingImmediates()
          done.resolve()
        } catch (err) {
          done.reject(err)
        }
      })

      await done.promise

      expect(logs).toEqual([
        'timeout 1',
        'timeout 1 -> immediate 1',
        'timeout 1 -> immediate 2',
        'timeout 2',
      ])
    }

    const schedulingCases = [
      {
        description: 'in sync code',
        scheduleCrash: (cb: () => void) => {
          cb()
        },
      },
      {
        description: 'in nextTick',
        scheduleCrash: (cb: () => void) => {
          process.nextTick(() => {
            cb()
          })
        },
      },
      {
        description: 'in microtask',
        scheduleCrash: (cb: () => void) => {
          queueMicrotask(() => {
            cb()
          })
        },
      },
      {
        description: 'after microtasks',
        scheduleCrash: (cb: () => void) => {
          queueMicrotask(() => {
            process.nextTick(() => {
              cb()
            })
          })
        },
      },
    ]

    describe.each([
      {
        description: 'starting capture twice in the same task',
        invalidCall: () => {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        },
      },
      {
        description: 'expectNoPendingImmediates in the same task as capture',
        invalidCall: () => {
          expectNoPendingImmediates()
        },
      },
    ])('crash reason - $description', ({ invalidCall }) => {
      it.each(schedulingCases)(
        'after a crash - $description',
        async ({ scheduleCrash }) => {
          // In the first run, we trigger a crash

          const { log, logs } = createLogger()
          const dones = [
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
          ]

          setTimeout(() => {
            setImmediate(() => {
              log('immediate 1 (native)')
              dones[0].resolve()
            })
          })
          setTimeout(() => {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            log('timeout 1')

            setImmediate(() => {
              log('timeout 1 -> immediate 1 (patched)')
              dones[1].resolve()
            })

            setImmediate(() => {
              log('timeout 1 -> immediate 2 (patched)')
              dones[2].resolve()
            })

            scheduleCrash(() => {
              expect(() => invalidCall()).toThrow()
            })
          })

          await Promise.all(dones.map((d) => d.promise))

          expect(logs).toEqual([
            'timeout 1',
            // The queued immediates should be rescheduled using native `setImmediate`,
            // so we should observe them happening after the native one we scheduled earlier
            'immediate 1 (native)',
            'timeout 1 -> immediate 1 (patched)',
            'timeout 1 -> immediate 2 (patched)',
          ])

          // The next run should work correctly
          await expectCorrectRunToWork()
        }
      )

      it.each(schedulingCases)(
        'after a crash in a patched immediate - $description',
        async ({ scheduleCrash }) => {
          // In the first run, we trigger a crash

          const { log, logs } = createLogger()
          const dones = [
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
          ]

          setTimeout(() => {
            setImmediate(() => {
              log('immediate 1 (native)')
              dones[0].resolve()
            })
          })
          setTimeout(() => {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            log('timeout 1')

            setImmediate(() => {
              log('timeout 1 -> immediate 1 (patched)')
              dones[1].resolve()
            })

            setImmediate(() => {
              log('timeout 1 -> immediate 2 (patched)')
              scheduleCrash(() => {
                expect(() => expectNoPendingImmediates()).toThrow()
              })
            })

            setImmediate(() => {
              log('timeout 1 -> immediate 3 (patched)')
              dones[2].resolve()
            })
          })

          await Promise.all(dones.map((d) => d.promise))

          expect(logs).toEqual([
            'timeout 1',
            'timeout 1 -> immediate 1 (patched)',
            'timeout 1 -> immediate 2 (patched)',
            // The remaining queued immediate should be rescheduled using native `setImmediate`,
            // so we should observe it happening after the native one we scheduled earlier
            'immediate 1 (native)',
            'timeout 1 -> immediate 3 (patched)',
          ])

          // The next run should work correctly
          await expectCorrectRunToWork()
        }
      )
    })
  })
})
