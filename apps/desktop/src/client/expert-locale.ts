/** Launch-form copy for the Chinese expert edition. */
import type { ExpertGateIssue } from '../welcome-api.ts'

/** Expert question and claimant labels, actions and recovery instructions. */
export const expertMessages = {
  brand: '智能知识', heading: '专家出题助手',
  uuid: '题目 UUID', uuidPlaceholder: '从千识领题链接复制 UUID',
  talent: '一面千识 ID', talentPlaceholder: '输入本人的数字 ID',
  submit: '开启对话', busy: '正在校验…',
  issues: {
    uuid: '找不到这道题。请从千识领题链接重新复制完整的 UUID',
    talent: '请填写本人的一面千识 ID，只输入大于零的整数',
    unassigned: '这道题还没有分配给专家。请先在千识确认认领，再回来重试',
    binding: '这道题当前未绑定到这个 ID。请核对本人的一面千识 ID 和领题链接',
    project: '这道题属于其他项目。请从本项目的领题链接复制 UUID，再试一次',
    rejected: '这道题已被拒绝。请查看千识审核结果，如有疑问可联系项目运营',
    approved: '这道题已审核通过。要开始下一道题，请输入新题目的 UUID',
    network: '暂时连不上千识。请检查网络后重试',
    response: '暂时无法确认题目信息。请稍后重试，若仍有问题请联系项目运营',
    workspace: '暂时无法打开对话。请重试',
  } satisfies Record<ExpertGateIssue, string>,
}
