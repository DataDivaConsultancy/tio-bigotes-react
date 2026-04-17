import { Card, CardContent } from '@/components/ui/card'
import { Construction } from 'lucide-react'

interface Props {
  title: string
  description?: string
}

export default function Placeholder({ title, description }: Props) {
  return (
    <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
            <Construction size={28} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {description || 'Esta sección está en desarrollo. Próximamente disponible.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
