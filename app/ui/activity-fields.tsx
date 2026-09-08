import { on, type Handle } from 'remix/ui'

// Shared by the interactive example and the real upload form.
export function ActivityFields(
  handle: Handle<{
    idPrefix: string
    title: string
    description: string
    onTitleInput: (value: string) => void
    onDescriptionInput: (value: string) => void
  }>,
) {
  return () => {
    const p = handle.props
    return (
      <div class="activity-fields">
        <div class="activity-field">
          <label for={p.idPrefix + '-title'}>Title</label>
          <input
            class="title-input"
            id={p.idPrefix + '-title'}
            name="title"
            required
            maxLength={100}
            value={p.title}
            mix={on('input', (event) => p.onTitleInput(event.currentTarget.value))}
          />
        </div>
        <div class="activity-field">
          <label for={p.idPrefix + '-description'}>Description</label>
          <textarea
            class="description-input"
            id={p.idPrefix + '-description'}
            name="description"
            rows={5}
            value={p.description}
            mix={on('input', (event) => p.onDescriptionInput(event.currentTarget.value))}
            aria-describedby={p.idPrefix + '-description-help'}
            placeholder="How’d it go? Share more about your activity."
          />
          <p class="description-help" id={p.idPrefix + '-description-help'}>
            Existing descriptions are combined in activity order, one per line. Edit, add to them,
            or leave this blank.
          </p>
        </div>
      </div>
    )
  }
}
