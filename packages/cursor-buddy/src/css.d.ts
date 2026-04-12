// Type declarations for CSS imports

declare module "*.css?inline" {
  const content: string
  export default content
}

declare module "*.css" {
  const content: string
  export default content
}
