import { component$, isDev } from '@builder.io/qwik';
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';

import { Qwik } from './components/qwik';
import './global.css';

export default component$(() => {
  return (
    <QwikCityProvider>
      <head>
        <meta charset='utf-8' />
        {!isDev && (
          <link
            rel='manifest'
            // @ts-ignore
            href={`${import.meta.env.BASE_URL}manifest.json`}
          />
        )}
        <Qwik />
      </head>
      <body lang='en'>
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  );
});
