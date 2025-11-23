use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, Vc};

use crate::{
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph, SingleModuleGraph},
};

#[turbo_tasks::value(transparent)]
pub struct ModulesSet(FxHashSet<ResolvedVc<Box<dyn Module>>>);

/// This lists all the modules that are async (self or transitively because they reference another
/// module in this list).
#[turbo_tasks::value(transparent)]
pub struct AsyncModulesInfo(FxHashSet<ResolvedVc<Box<dyn Module>>>);

#[turbo_tasks::value_impl]
impl AsyncModulesInfo {
    #[turbo_tasks::function]
    pub fn is_async(&self, module: ResolvedVc<Box<dyn Module>>) -> Vc<bool> {
        Vc::cell(self.0.contains(&module))
    }

    #[turbo_tasks::function]
    pub async fn is_async_multiple(&self, modules: ResolvedVc<Modules>) -> Result<Vc<ModulesSet>> {
        Ok(Vc::cell(
            modules
                .await?
                .iter()
                .copied()
                .filter(|m| self.0.contains(m))
                .collect(),
        ))
    }
}

#[turbo_tasks::function(operation)]
pub async fn compute_async_module_info(
    graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<AsyncModulesInfo>> {
    // Layout segment optimization, we can individually compute the async modules for each graph.
    let mut result: Vc<AsyncModulesInfo> = Vc::cell(Default::default());
    for g in &graph.await?.graphs {
        result = compute_async_module_info_single(**g, result);
    }
    Ok(result)
}

#[turbo_tasks::function]
async fn compute_async_module_info_single(
    graph: Vc<SingleModuleGraph>,
    parent_async_modules: Vc<AsyncModulesInfo>,
) -> Result<Vc<AsyncModulesInfo>> {
    let parent_async_modules = parent_async_modules.await?;
    let graph = graph.await?;

    let self_async_modules = graph
        .enumerate_nodes()
        .map(async |(_, node)| {
            Ok(match node {
                super::SingleModuleGraphNode::Module(node) => {
                    node.is_self_async().await?.then_some(*node)
                }
                super::SingleModuleGraphNode::VisitedModule { idx: _, module } => {
                    // If a module is async in the parent then we need to mark reverse dependencies
                    // async in this graph as well.
                    parent_async_modules.contains(module).then_some(*module)
                }
            })
        })
        .try_flat_join()
        .await?;

    // To determine which modules are async, we need to propagate the self-async flag to all
    // importers, which is done using a reverse traversal over the graph
    // Because we walks edges in the reverse direction we can trivially handle things like cycles
    // without actually computing them.
    let mut async_modules = FxHashSet::default();

    let graph_ref = graph.read();
    graph_ref.traverse_edges_from_entries_dfs_reversed(
        self_async_modules,
        &mut (),
        |parent, module, _state| {
            Ok(
                if let Some((_, edge)) = parent
                    && edge.chunking_type.is_inherit_async()
                {
                    async_modules.insert(module);
                    GraphTraversalAction::Continue
                } else if parent.is_none() {
                    // These are our entry points, just continue
                    async_modules.insert(module);
                    GraphTraversalAction::Continue
                } else {
                    GraphTraversalAction::Exclude
                },
            )
        },
        |_, _, _| Ok(()),
    )?;

    // Accumulate the parent modules at the end
    async_modules.extend(parent_async_modules);

    Ok(Vc::cell(async_modules))
}
