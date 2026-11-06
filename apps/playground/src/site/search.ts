import { createFromSource } from 'fumadocs-core/search/server'
import { source } from './source'

const search = createFromSource(source)
export const loader = () => search.staticGET()
