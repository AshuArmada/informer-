/** Parse repository references without treating arbitrary URLs as search topics. */
export function repositoryName(input: string): string | null {
  let value = input.trim()
  if (/^(https?:\/\/|www\.|github\.com\/)/i.test(value)) {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('Paste a github.com repository URL or enter owner/repository.')
    }
    value = url.pathname.split('/').filter(Boolean).slice(0, 2).join('/')
    if (!value.includes('/')) throw new Error('The GitHub URL must include an owner and repository.')
  }
  value = value.replace(/\/$/, '').replace(/\.git$/, '')
  if (!value.includes('/')) return null
  if (!/^[a-z\d][a-z\d-]{0,38}\/[\w.-]{1,100}$/i.test(value) || ['.', '..'].includes(value.split('/')[1])) {
    throw new Error('Use owner/repository or a complete GitHub repository URL.')
  }
  return value
}

export const contributionLink = (name: string) => `#contribute?repo=${encodeURIComponent(name)}`
