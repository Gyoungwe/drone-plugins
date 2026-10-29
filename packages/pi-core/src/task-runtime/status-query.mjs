/** User status intent belongs to the task package, including native Pi. */
export function isTaskStatusQuery(text) {
  return /^(?:完成到哪了|进度(?:如何|怎么样)?|查看(?:任务)?进度|任务状态|task status|what(?:'s| is) the status)[\s.!？，。！?]*$/i.test(text.trim());
}
