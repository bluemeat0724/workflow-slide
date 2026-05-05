export function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

export function noContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  })
  response.end()
}

export async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function handleError(response, error) {
  if (error instanceof SyntaxError) {
    return json(response, 400, {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Request body is not valid JSON.',
    })
  }

  if (error && typeof error === 'object' && 'status' in error && 'code' in error) {
    return json(response, error.status, {
      ok: false,
      code: error.code,
      message: error.message,
      details: error.details,
    })
  }

  console.error(error)
  return json(response, 500, {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error.',
  })
}
