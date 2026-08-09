import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/public/verify-camera-v4")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // process.env inside handler is safe in TanStack Start
        const mode = process.env['CAMERA_V4_MODE'] || 'lab_only'
        const body = await request.json()
        
        return Response.json({ 
          status: 'success', 
          message: 'Camera V4 API initialized.',
          mode,
          attempt: { id: "v4_" + Math.random().toString(36).substring(2, 9), state: "created" }
        })
      },
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const attemptId = url.searchParams.get('attemptId')
        return Response.json({
          id: attemptId,
          state: 'approved',
          decision: 'approved',
          verifiedAt: new Date().toISOString()
        })
      }
    }
  }
})
