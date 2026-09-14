import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { Button } from './ui/Button'
import { Card } from './ui/Display'
import { LogoMark } from '@/shared/components/Logo'

export default function RouteErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'The page could not be loaded.'

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-5">
      <Card className="max-w-lg w-full text-center">
        <LogoMark size={40} className="mx-auto mb-5" />
        <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 text-red-600 grid place-items-center">
          <span className="material-symbols-outlined">error</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-950 mt-4">This page needs attention</h1>
        <p className="text-slate-500 mt-2">{message}</p>
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          <Button variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
          <Button onClick={() => navigate('/app/dashboard')}>Return to dashboard</Button>
        </div>
      </Card>
    </div>
  )
}
