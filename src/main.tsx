import { ColorSchemeScript, MantineProvider, createTheme, localStorageColorSchemeManager } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import ReactDOM from 'react-dom/client'

import { App } from './app'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './style.css'

const theme = createTheme({
  colors: {
    sand: ['#f8f3ea', '#f2eadf', '#eadbc6', '#e4cda8', '#ddbe88', '#d5af67', '#c99a45', '#aa7d34', '#845f29', '#5d421c'],
    ink: ['#e6eef2', '#c2d3dc', '#9cb7c6', '#7498ad', '#4f7a94', '#375f77', '#26485b', '#173240', '#0f2230', '#081621'],
  },
  fontFamily: 'Aptos, "Segoe UI Variable Text", "Trebuchet MS", sans-serif',
  headings: {
    fontFamily: '"Iowan Old Style", Georgia, serif',
  },
  primaryColor: 'ink',
  primaryShade: 8,
  radius: {
    xl: '24px',
  },
})

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'bwiki.color-scheme',
})

const container = document.querySelector<HTMLDivElement>('#app')
if (!container) {
  throw new Error('Missing #app root')
}

ReactDOM.createRoot(container).render(
  <>
    <ColorSchemeScript defaultColorScheme="light" />
    <MantineProvider colorSchemeManager={colorSchemeManager} defaultColorScheme="light" theme={theme}>
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </>,
)
