/**
 * Settings, presented as tabs on desktop and as collapsible sections on
 * mobile (where a tall single column beats a cramped tab bar).
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CharacterPanel } from '@/components/settings/CharacterPanel'
import { ExportPanel } from '@/components/settings/ExportPanel'
import { ImageTransformPanel } from '@/components/settings/ImageTransformPanel'
import { LettersPanel } from '@/components/settings/LettersPanel'
import { LogoPanel } from '@/components/settings/LogoPanel'
import { cn } from '@/lib/utils'

export function SettingsSidebar({ className }: { className?: string }) {
  return (
    <aside className={cn('flex min-h-0 flex-col', className)}>
      <Tabs defaultValue="image" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="image">Image</TabsTrigger>
          <TabsTrigger value="logo">Logo</TabsTrigger>
          <TabsTrigger value="label">Label</TabsTrigger>
          <TabsTrigger value="letters">Letters</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
        <div className="scrollbar-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <TabsContent value="image">
            <ImageTransformPanel />
          </TabsContent>
          <TabsContent value="logo">
            <LogoPanel />
          </TabsContent>
          <TabsContent value="label">
            <CharacterPanel />
          </TabsContent>
          <TabsContent value="letters">
            <LettersPanel />
          </TabsContent>
          <TabsContent value="export">
            <ExportPanel />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}

export function SettingsAccordion({ className }: { className?: string }) {
  return (
    <Accordion
      type="multiple"
      defaultValue={['image']}
      className={cn('rounded-xl border border-border bg-card px-4', className)}
    >
      <AccordionItem value="image">
        <AccordionTrigger>Image Transform</AccordionTrigger>
        <AccordionContent>
          <ImageTransformPanel />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="logo">
        <AccordionTrigger>Logo Settings</AccordionTrigger>
        <AccordionContent>
          <LogoPanel />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="label">
        <AccordionTrigger>Character Label</AccordionTrigger>
        <AccordionContent>
          <CharacterPanel />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="letters">
        <AccordionTrigger>Extra Letters</AccordionTrigger>
        <AccordionContent>
          <LettersPanel />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="export">
        <AccordionTrigger>Export</AccordionTrigger>
        <AccordionContent>
          <ExportPanel />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
