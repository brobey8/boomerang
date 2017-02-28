import { normalize, schema } from 'normalizr'
import { camelizeKeys } from 'humps'


const API_ROOT = 'http://188.166.210.189';

export const httppost = 'POST';
export const httpget = 'GET';

// Fetches an API response and normalizes the result JSON according to schema.
// This makes every API response have the same shape, regardless of how nested it was.
const callApi = (endpoint, schema, httpverb = httpget, payload) => {
  const fullUrl = (endpoint.indexOf(API_ROOT) === -1) ? API_ROOT + endpoint : endpoint
  console.log(fullUrl);
  switch (httpverb) {
    case httpget: {
      return fetch(fullUrl)
          .then(response =>
              response.json().then(json => ({ json, response }))
          ).then(({ json, response }) => {
            if (!response.ok) {
              return Promise.reject(json)
            }

            const camelizedJson = camelizeKeys(json)

            return Object.assign({},
                normalize(camelizedJson, schema))
          })
      }
    case httppost: {
      console.log(JSON.stringify(payload));
      return fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })
          .then(response =>
              response.json().then(json => ({ json, response }))
          ).then(({ json, response }) => {
            if (!response.ok) {
              return Promise.reject(json)
            }

            const camelizedJson = camelizeKeys(json)

            return Object.assign({},
                normalize(camelizedJson, schema))
          })
    }

  }


}

// We use this Normalizr schemas to transform API responses from a nested form
// to a flat form where repos and users are placed in `entities`, and nested
// JSON objects are replaced with their IDs. This is very convenient for
// consumption by reducers, because we can easily build a normalized tree
// and keep it updated as we fetch more data.

// Read more about Normalizr: https://github.com/paularmstrong/normalizr

// GitHub's API may return results with uppercase letters while the query
// doesn't contain any. For example, "someuser" could result in "SomeUser"
// leading to a frozen UI as it wouldn't find "someuser" in the entities.
// That's why we're forcing lower cases down there.

const userSchema = new schema.Entity('users', {}, {
  idAttribute: user => user.login.toLowerCase()
})

const repoSchema = new schema.Entity('repos', {
  owner: userSchema
}, {
  idAttribute: repo => repo.fullName.toLowerCase()
})

// Schemas for Github API responses.
export const Schemas = {
  USER: userSchema,
  USER_ARRAY: [userSchema],
  REPO: repoSchema,
  REPO_ARRAY: [repoSchema]
}

// Action key that carries API call info interpreted by this Redux middleware.
export const CALL_API = Symbol('Call API')

// A Redux middleware that interprets actions with CALL_API info specified.
// Performs the call and promises when such actions are dispatched.
export default store => next => action => {
  const callAPI = action[CALL_API]
  if (typeof callAPI === 'undefined') {
    return next(action)
  }

  let { endpoint } = callAPI
  const { schema, types, httpverb, payload } = callAPI

  if (typeof endpoint === 'function') {
    endpoint = endpoint(store.getState())
  }

  if (typeof endpoint !== 'string') {
    throw new Error('Specify a string endpoint URL.')
  }
  if (!httpverb) {
    throw new Error('Please specify a HTTP method')
  }
  if (!schema) {
    throw new Error('Specify one of the exported Schemas.')
  }
  if (!Array.isArray(types) || types.length !== 3) {
    throw new Error('Expected an array of three action types.')
  }
  if (!types.every(type => typeof type === 'string')) {
    throw new Error('Expected action types to be strings.')
  }

  const actionWith = data => {
    const finalAction = Object.assign({}, action, data)
    delete finalAction[CALL_API]
    return finalAction
  }

  const [ requestType, successType, failureType ] = types
  next(actionWith({ type: requestType }))

  console.log(payload);

  return callApi(endpoint, schema, httpverb, payload ? payload : '').then(
    response => next(actionWith({
      response,
      type: successType
    })),
    error => next(actionWith({
      type: failureType,
      error: error.message || 'Something bad happened'
    }))
  )
}
