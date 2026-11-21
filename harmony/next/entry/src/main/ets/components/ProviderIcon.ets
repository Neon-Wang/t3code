/** The provider glyph generated from the mobile ProviderIcon and the provider registry. */
export function providerIcon(provider: string): Resource {
  switch (provider) {
    case 'claudeAgent': return $r('app.media.provider_claudeagent');
    case 'acpRegistry': return $r('app.media.provider_acpregistry');
    case 'fx': return $r('app.media.provider_fx');
    case 'kiro': return $r('app.media.provider_kiro');
    case 'muse': return $r('app.media.provider_muse');
    case 'pi': return $r('app.media.provider_pi');
    case 'cursor': return $r('app.media.provider_cursor');
    case 'grok': return $r('app.media.provider_grok');
    case 'opencode': return $r('app.media.provider_opencode');
    case 'antigravity': return $r('app.media.provider_antigravity');
    default: return $r('app.media.provider_codex');
  }
}
