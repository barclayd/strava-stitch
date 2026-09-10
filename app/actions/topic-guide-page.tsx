import type { Handle } from 'remix/ui'
import { Shell } from '../ui/shell.tsx'
import { routes } from '../routes.ts'
import type { PageSeo } from '../seo.ts'
import { guideTopics, guideTopicKeys, type GuideTopic } from '../guide-topics.ts'
import { guideSections } from './guide-sections.tsx'
import { GuideActions } from '../ui/guide-actions.tsx'

export function TopicGuidePage(
  handle: Handle<{ csrf: string; seo: PageSeo; topic: GuideTopic; firstname?: string }>,
) {
  return () => {
    const topic = guideTopics[handle.props.topic]
    const sections = guideSections[handle.props.topic]
    return (
      <Shell {...handle.props} analyticsPage={handle.props.topic}>
        <main id="main" class="guide-page">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href={routes.home.href()}>Stitch</a>
            <span aria-hidden="true">/</span>
            <a href={routes.guide.href()}>Merge Strava activities</a>
            <span aria-hidden="true">/</span>
            <span>{topic.label}</span>
          </nav>
          <article>
            <header class="guide-heading">
              <span class="eyebrow">THE STITCH GUIDE</span>
              <h1>{topic.heading}</h1>
              <p class="guide-deck">{topic.intro}</p>
              <GuideActions firstname={handle.props.firstname} />
              <p class="article-byline">
                By <a href={routes.privacy.href() + '#support'}>Barksoft Ltd.</a>
                <span aria-hidden="true">·</span>Updated{' '}
                <time dateTime={topic.updated}>
                  {new Date(topic.updated + 'T00:00:00Z').toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </time>
              </p>
            </header>
            <div class="article-layout">
              <nav class="article-toc" aria-label="On this page">
                <strong>IN THIS GUIDE</strong>
                {sections.map((section) => (
                  <a key={section.id} href={'#' + section.id}>
                    {section.title}
                  </a>
                ))}
                <a href="#related-guides">Related guides</a>
              </nav>
              <div class="article-body">
                {sections.map((section) => (
                  <section key={section.id} id={section.id}>
                    <h2>{section.title}</h2>
                    {section.body}
                  </section>
                ))}
                <aside class="guide-cta">
                  <span class="overline">BRING EVERY PART TOGETHER</span>
                  <h2>Combine your Strava activities in seconds.</h2>
                  <p>
                    Free to use, always. Privacy first, from preview to upload. Stitch is in early
                    access, with limited Strava connections.
                  </p>
                  <a
                    class="button button-dark"
                    href={routes.home.href()}
                    data-funnel="stitch_click"
                    data-funnel-placement="guide"
                  >
                    Combine your activities <span aria-hidden="true">→</span>
                  </a>
                  <a
                    class="inline-link"
                    href={routes.demo.href()}
                    data-funnel="example_click"
                    data-funnel-placement="guide"
                  >
                    Explore the example without an account
                  </a>
                </aside>
                <section id="related-guides">
                  <h2>Related guides</h2>
                  <ul>
                    <li>
                      <a href={routes.guide.href()}>How to merge Strava activities</a>
                    </li>
                    {guideTopicKeys
                      .filter((key) => key !== handle.props.topic)
                      .map((key) => (
                        <li key={key}>
                          <a
                            href={routes[key].href()}
                            data-funnel="guide_click"
                            data-funnel-placement="guide"
                          >
                            {guideTopics[key].heading}
                          </a>
                        </li>
                      ))}
                  </ul>
                </section>
              </div>
            </div>
          </article>
        </main>
      </Shell>
    )
  }
}
