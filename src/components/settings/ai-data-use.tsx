import { SettingsBlock, SettingsGroup } from "./settings-group";

/** Settings → Security & access: what the Request AI check sends. */
export function AiDataUse() {
  return <SettingsGroup id="ai-data" tabIndex={-1} label="AI data use" labelId="ai-data-label" description="How the Request AI check uses your content.">
    <SettingsBlock>
      <p>When you run the AI check while creating a Request or editing its title or description, Lane sends that title and description to Anthropic (Claude Haiku 4.5) to classify the Request and, where needed, suggest a problem statement.</p>
      <p>Attachments, comments, and structured impact fields are not included in this call. Any personal or sensitive information you type into the title or description is included.</p>
      <p>This describes the current check. It does not change your account or enable additional data sharing.</p>
    </SettingsBlock>
  </SettingsGroup>;
}
