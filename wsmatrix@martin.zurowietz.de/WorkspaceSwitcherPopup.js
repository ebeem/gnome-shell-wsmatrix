const { Clutter, GLib, GObject, Meta, St } = imports.gi;
const WsMatrix = imports.misc.extensionUtils.getCurrentExtension();
const DisplayWrapper = WsMatrix.imports.DisplayWrapper.DisplayWrapper;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup.WorkspaceSwitcherPopup;
const WorkspaceSwitcherPopupList = imports.ui.workspaceSwitcherPopup.WorkspaceSwitcherPopupList;
const WorkspaceThumbnail = WsMatrix.imports.workspaceThumbnail.WsmatrixThumbnail;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;

const Main = imports.ui.main;

var WsmatrixPopupList = GObject.registerClass(
class WsmatrixPopupList extends WorkspaceSwitcherPopupList {
   _init(rows, columns, scale, monitorIndex) {
      super._init();
      this._rows = rows;
      this._columns = columns;
      this._scale = scale;
      this._activeWorkspaceIndex = 0;
      this._monitorIndex = monitorIndex;
   }

   vfunc_get_preferred_height(forWidth) {
      let children = this.get_children();
      let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
      let themeNode = this.get_theme_node();

      let availHeight = workArea.height;
      availHeight -= themeNode.get_vertical_padding();

      let height = this._rows * this._scale * children[0].get_height();
      let spacing = this._itemSpacing * (this._rows - 1);

      height += spacing;
      height = Math.round(Math.min(height, availHeight));

      this._childHeight = Math.round((height - spacing) / this._rows);

      return themeNode.adjust_preferred_height(height, height);
   }

   vfunc_get_preferred_width(forHeight) {
      let children = this.get_children();
      let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
      let themeNode = this.get_theme_node();

      let availWidth = workArea.width;
      availWidth -= themeNode.get_horizontal_padding();

      let width = this._columns * this._scale * children[0].get_width();
      let spacing = this._itemSpacing * (this._columns - 1);

      width += spacing;
      width = Math.round(Math.min(width, availWidth));

      this._childWidth = Math.round((width - spacing) / this._columns);

      return themeNode.adjust_preferred_height(width, width);
   }

   vfunc_allocate(box, flags) {
      this.set_allocation(box, flags);

      let themeNode = this.get_theme_node();
      box = themeNode.get_content_box(box);

      let children = this.get_children();
      let childBox = new Clutter.ActorBox();

      let row = 0;
      let column = 0;
      let itemWidth = this._childWidth + this._itemSpacing;
      let itemHeight = this._childHeight + this._itemSpacing;
      let indicatorOffset = Math.round(this._itemSpacing / 2);
      let indicator = children.pop();

      for (let i = 0; i < children.length; i++) {
         row = Math.floor(i / this._columns);
         column = i % this._columns;

         childBox.x1 = Math.round(box.x1 + itemWidth * column);
         childBox.x2 = childBox.x1 + children[i].get_width();
         childBox.y1 = Math.round(box.y1 + itemHeight * row);
         childBox.y2 = childBox.y1 + children[i].get_height();
         children[i].allocate(childBox, flags);

         if (i === this._activeWorkspaceIndex) {
            childBox.x1 -= indicatorOffset;
            childBox.x2 = childBox.x1 + this._childWidth + indicatorOffset * 2;
            childBox.y1 -= indicatorOffset;
            childBox.y2 = childBox.y1 + this._childHeight + indicatorOffset * 2;
            indicator.allocate(childBox, flags);
         }
      }
   }

   getChildWidth() {
      return this._childWidth;
   }

   getChildHeight() {
      return this._childHeight;
   }

   setActiveWorkspaceIndex(index) {
      this._activeWorkspaceIndex = index;
   }
});

var WsmatrixPopup = GObject.registerClass(
class WsmatrixPopup extends WorkspaceSwitcherPopup {
   _init(rows, columns, scale, monitorIndex) {
      super._init();
      this._workspaceManager = DisplayWrapper.getWorkspaceManager();
      this._monitorIndex = monitorIndex;
      let oldList = this._list;
      this._list = new WsmatrixPopupList(rows, columns, scale, this._monitorIndex);
      this._container.replace_child(oldList, this._list);
      this._redisplay();
      this.hide();
   }
   _show(time=0.1) {
       Tweener.addTween(this._container, { opacity: 255,
                                           time: time,
                                           transition: 'easeOutQuad'
                                          });
       this.show();
   }

   _onTimeout(time=0.1) {
       Mainloop.source_remove(this._timeoutId);
       this._timeoutId = 0;
       Tweener.addTween(this._container, { opacity: 0.0,
                                           time: time,
                                           transition: 'easeOutQuad',
                                           onComplete() { this.hide(); },
                                           onCompleteScope: this
                                          });
       return GLib.SOURCE_REMOVE;
   }

   destroy() {
       this._onTimeout(0);
   }

   _destroy() {
       super.destroy();
   }

   _onDestroy() {
       super._onDestroy();
       log("called destroy");
   }

   _redisplay() {
      if (!(this._list instanceof WsmatrixPopupList)) {
         return;
      }

      this._list.destroy_all_children();
      if (this._activeWorkspaceIndex !== undefined) {
         this._list.setActiveWorkspaceIndex(this._activeWorkspaceIndex);
      }

      for (let i = 0; i < this._workspaceManager.n_workspaces; i++) {
         let workspace = this._workspaceManager.get_workspace_by_index(i);
         let thumbnail = new WorkspaceThumbnail(workspace, this._monitorIndex);
         let hScale = this._list.getChildWidth() / thumbnail.actor.get_width();
         let vScale = this._list.getChildHeight() / thumbnail.actor.get_height();
         thumbnail.actor.set_scale(hScale, vScale);
         this._list.add_actor(thumbnail.actor);
      }

      // The workspace indicator is always last.
      this._list.add_actor(new St.Bin({style_class: 'workspace-thumbnail-indicator'}));

      let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
      let [containerMinHeight, containerNatHeight] = this._container.get_preferred_height(global.screen_width);
      let [containerMinWidth, containerNatWidth] = this._container.get_preferred_width(containerNatHeight);
      this._container.x = workArea.x + Math.floor((workArea.width - containerNatWidth) / 2);
      this._container.y = workArea.y + Math.floor((workArea.height - containerNatHeight) / 2);
   }
});
