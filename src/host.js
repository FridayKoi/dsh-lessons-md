// Host 入口：错题本面板的宿主侧壳。
// v1 面板是纯浏览器端实现（通过 workspaceFiles Remote 直接读工作区文件），
// Host 侧暂不需要贡献服务；空 apply 让 Loader 能发现并挂载本包。
export const name = 'mistake-notebook'

export function apply(ctx) {
  console.log('[mistake-notebook] host shell loaded')
}
