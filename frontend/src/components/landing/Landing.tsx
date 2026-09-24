import {
  ArrowRight,
  FileText,
  Images,
  Lock,
  Moon,
  Settings2,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react'

import { Logomark } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { useTheme } from '@/hooks/useTheme'

const FEATURES = [
  {
    icon: Sparkles,
    title: 'High Quality',
    body: 'Preserve your original image quality.',
  },
  {
    icon: Images,
    title: 'Batch Processing',
    body: 'Brand multiple images at once.',
  },
  {
    icon: Settings2,
    title: 'Individual Editing',
    body: 'Fine-tune every image separately.',
  },
  {
    icon: Smartphone,
    title: 'Instagram Ready',
    body: 'Export directly in social-friendly formats.',
  },
]

const STEPS = ['Upload', 'Edit', 'Preview', 'Download']

export function Landing({
  onStart,
  onOpenComposer,
  onOpenCatalog,
}: {
  onStart: () => void
  onOpenComposer: () => void
  onOpenCatalog: () => void
}) {
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Logomark />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenCatalog}>
            Catalog slide
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenComposer}>
            Image editor
          </Button>
          <Button size="sm" onClick={onStart}>
            Start Editing
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20">
        <section className="flex flex-col items-center gap-5 py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Batch watermarking with Canva-style positioning
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Add Your Logo. Brand Every Image.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Upload multiple images, position your logo, fine-tune every image individually, and
            export high-quality branded images in seconds.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button size="lg" onClick={onStart}>
              Start Editing
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={onOpenComposer}>
              Open the image editor
            </Button>
            <Button size="lg" variant="outline" onClick={onOpenCatalog}>
              <FileText className="size-4" />
              Catalog slide
            </Button>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {STEPS.map((step, index) => (
                <span key={step} className="flex items-center gap-2">
                  {index > 0 ? <span className="text-border">→</span> : null}
                  {step}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="p-5">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-3 text-[15px] font-semibold">{feature.title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </Card>
          ))}
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <Card className="p-6">
            <h2 className="text-lg font-semibold tracking-tight">
              Position each image, not just the logo
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Scale, drag and nudge every photo inside its export frame — the way you would in
              Figma or Canva. Each image keeps its own scale and offsets, and the server renders
              the final file from your original upload using exactly the numbers you set.
            </p>
            <ul className="mt-4 grid gap-2 text-[13px] text-muted-foreground sm:grid-cols-2">
              <li>• Per-image scale and position</li>
              <li>• Logo stays fixed while the photo moves</li>
              <li>• Automatic A, B, C… labels, plus extra letters anywhere</li>
              <li>• Individual and ZIP downloads</li>
              <li>• A single-image editor for text and logos</li>
              <li>• Export as the photo, or as a printable card</li>
            </ul>
          </Card>
          <Card className="flex flex-col justify-center gap-3 p-6">
            <Lock className="size-5 text-primary" />
            <h2 className="text-[15px] font-semibold">Your images stay yours.</h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Images are processed temporarily and are not permanently stored. Every editing
              session lives in its own throw-away folder that is deleted automatically.
            </p>
          </Card>
        </section>
      </main>
    </div>
  )
}
