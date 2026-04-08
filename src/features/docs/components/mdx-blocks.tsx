import {
  Accordion,
  Alert,
  Anchor,
  AspectRatio,
  Badge,
  Box,
  Button,
  Card as MantineCard,
  Code,
  CopyButton,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconArrowUpRight,
  IconCircleCheck,
  IconInfoCircle,
  IconPhoto,
} from '@tabler/icons-react'
import {
  Children,
  isValidElement,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'

type CalloutTone = 'info' | 'success' | 'warning'

const toneIconMap = {
  info: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertCircle,
} satisfies Record<CalloutTone, typeof IconInfoCircle>

export function Callout({
  children,
  title,
  tone = 'info',
}: PropsWithChildren<{ title?: string; tone?: CalloutTone }>) {
  const Icon = toneIconMap[tone]

  return (
    <Alert
      color={tone === 'warning' ? 'orange' : tone === 'success' ? 'teal' : 'blue'}
      icon={<Icon size={18} />}
      radius="lg"
      title={title}
      variant="light"
    >
      {children}
    </Alert>
  )
}

export function DocTab({ children }: PropsWithChildren<{ label: string }>) {
  return <>{children}</>
}

export function DocTabs({ children }: PropsWithChildren) {
  const tabs = Children.toArray(children).filter(isValidElement) as Array<
    ReactElement<{ label: string; children?: ReactNode }>
  >
  const firstTab = tabs[0]
  const defaultValue = firstTab ? String(firstTab.props.label) : 'tab-0'

  return (
    <Tabs color="dark" defaultValue={defaultValue} radius="xl" variant="outline">
      <Tabs.List grow mb="md">
        {tabs.map((tab) => (
          <Tabs.Tab key={String(tab.props.label)} value={String(tab.props.label)}>
            {String(tab.props.label)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel key={String(tab.props.label)} pt="sm" value={String(tab.props.label)}>
          <Paper bg="var(--mantine-color-sand-0)" p="lg" radius="xl" withBorder>
            {tab.props.children}
          </Paper>
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}

export function DocAccordionItem({ children }: PropsWithChildren<{ label: string }>) {
  return <>{children}</>
}

export function DocAccordion({ children }: PropsWithChildren) {
  const items = Children.toArray(children).filter(isValidElement) as Array<
    ReactElement<{ label: string; children?: ReactNode }>
  >

  return (
    <Accordion chevronPosition="right" defaultValue={String(items[0]?.props.label ?? '')} radius="lg" variant="contained">
      {items.map((item) => (
        <Accordion.Item key={String(item.props.label)} value={String(item.props.label)}>
          <Accordion.Control>{String(item.props.label)}</Accordion.Control>
          <Accordion.Panel>{item.props.children}</Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}

export function Card({ children, eyebrow, title }: PropsWithChildren<{ eyebrow?: string; title: string }>) {
  return (
    <MantineCard padding="lg" radius="xl" shadow="none" withBorder>
      <Stack gap="xs">
        {eyebrow ? (
          <Badge color="orange" radius="sm" variant="light" w="fit-content">
            {eyebrow}
          </Badge>
        ) : null}
        <Title order={4}>{title}</Title>
        <Text c="dimmed" size="sm">
          {children}
        </Text>
      </Stack>
    </MantineCard>
  )
}

export function CardGrid({ children }: PropsWithChildren) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
      {children}
    </SimpleGrid>
  )
}

export function Figure({ alt, caption, src }: { alt: string; caption?: string; src: string }) {
  return (
    <Stack component="figure" gap="sm" m={0}>
      <Image alt={alt} radius="xl" src={src} />
      <Group c="dimmed" gap="xs" wrap="nowrap">
        <ThemeIcon color="gray" radius="xl" size="sm" variant="transparent">
          <IconPhoto size={16} />
        </ThemeIcon>
        <Text component="figcaption" size="sm">
          {caption ?? alt}
        </Text>
      </Group>
    </Stack>
  )
}

export function ExternalEmbed({
  kind = 'external',
  title,
  url,
}: {
  kind?: 'external' | 'figma' | 'loom' | 'youtube'
  title: string
  url: string
}) {
  const safeUrl = /^https?:\/\//.test(url) ? url : 'about:blank'

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={4}>{title}</Title>
        <Badge radius="sm" variant="light">
          {kind}
        </Badge>
      </Group>
      <AspectRatio ratio={16 / 9}>
        <Box
          component="iframe"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          src={safeUrl}
          style={{ border: 0, borderRadius: '20px', width: '100%', height: '100%' }}
          title={title}
        />
      </AspectRatio>
    </Stack>
  )
}

export function CodeBlock(props: HTMLAttributes<HTMLPreElement>) {
  const child = isValidElement<{ children?: ReactNode; className?: string }>(props.children)
    ? props.children
    : undefined
  const codeContent = child?.props.children
  const text = typeof codeContent === 'string' ? codeContent.trim() : ''
  const language = String(child?.props.className ?? '').replace('language-', '') || 'code'

  return (
    <Paper component="pre" mt="lg" p="lg" radius="xl" style={{ overflowX: 'auto' }} withBorder>
      <Group justify="space-between" mb="sm">
        <Code>{language}</Code>
        <CopyButton timeout={1200} value={text}>
          {({ copied, copy }) => (
            <Button color={copied ? 'teal' : 'dark'} onClick={copy} radius="xl" size="compact-sm" variant="light">
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Box component="code" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>
        {text}
      </Box>
    </Paper>
  )
}

export function InlineCode(props: HTMLAttributes<HTMLElement>) {
  return <Code {...props} />
}

export function MarkdownLink({ children, href = '' }: PropsWithChildren<{ href?: string }>) {
  if (href.startsWith('/docs/')) {
    return (
      <Anchor component={Link} fw={600} to={href}>
        {children}
      </Anchor>
    )
  }

  return (
    <Anchor href={href} rel="noreferrer" target="_blank">
      <Group component="span" gap={4} wrap="nowrap">
        <span>{children}</span>
        <IconArrowUpRight size={14} />
      </Group>
    </Anchor>
  )
}
