/* 
 * Egroupware Calendar timegrid
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package etemplate
 * @subpackage api
 * @link http://www.egroupware.org
 * @author Nathan Gray
 * @version $Id$
 */


"use strict";

/*egw:uses
	/calendar/js/et2_widget_view.js;
	/calendar/js/et2_widget_daycol.js;
	/calendar/js/et2_widget_event.js;
*/

/**
 * Class which implements the "calendar-timegrid" XET-Tag for displaying a span of days
 *
 * This widget is responsible for the times on the side, and it is also the
 * controller for both positioning and setting the day columns.  Day columns are
 * recycled rather than removed and re-created to reduce reloading.  Similarly,
 * the horizontal time grid (when used - see granularity attribute) is only
 * redrawn or resized when needed.  Unfortunately resizing is needed every time
 * the all day section has an event added or removed so the full work day from
 * start time to end time is properly displayed.
 *
 *
 * @augments et2_calendar_view
 */
var et2_calendar_timegrid = et2_calendar_view.extend([et2_IDetachedDOM, et2_IResizeable],
{
	createNamespace: true,
	
	attributes: {
		value: {
			type: "any",
			description: "An array of events, indexed by date (Ymd format)."
		},
		day_start: {
			name: "Day start time",
			type: "string",
			default: parseInt(egw.preference('workdaystarts','calendar')) || 9,
			description: "Work day start time.  If unset, this will default to the current user's preference"
		},
		day_end: {
			name: "Day end time",
			type: "string",
			default: parseInt(egw.preference('workdayends','calendar')) || 17,
			description: "Work day end time.  If unset, this will default to the current user's preference"
		},
		show_weekend: {
			name: "Weekends",
			type: "boolean",
			default: egw.preference('days_in_weekview','calendar') != 5,
			description: "Display weekends.  The date range should still include them for proper scrolling, but they just won't be shown."
		},
		granularity: {
			name: "Granularity",
			type: "integer",
			default: parseInt(egw.preference('interval','calendar')) || 30,
			description: "How many minutes per row, or 0 to display events as a list"
		},
		"onchange": {
			"name": "onchange",
			"type": "js",
			"default": et2_no_init,
			"description": "JS code which is executed when the date range changes."
		},
		"onevent_change": {
			"name": "onevent_change",
			"type": "js",
			"default": et2_no_init,
			"description": "JS code which is executed when an event changes."
		},
		height: {
			"default": '100%'
		}
	},
	/**
	 * Constructor
	 *
	 * @memberOf et2_calendar_timegrid
	 */
	init: function() {
		this._super.apply(this, arguments);

		// Main container
		this.div = $j(document.createElement("div"))
			.addClass("calendar_calTimeGrid")
			.addClass("calendar_TimeGridNoLabel");

		// Headers
		this.gridHeader = $j(document.createElement("div"))
			.addClass("calendar_calGridHeader")
			.appendTo(this.div);
		this.dayHeader = $j(document.createElement("div"))
			.appendTo(this.gridHeader);
		
		// Contains times / rows
		this.scrolling = $j(document.createElement('div'))
			.addClass("calendar_calTimeGridScroll")
			.appendTo(this.div)
			.append('<div class="calendar_calTimeLabels"></div>');

		// Contains days / columns
		this.days = $j(document.createElement("div"))
			.addClass("calendar_calDayCols")
			.appendTo(this.scrolling);

		// Used for owners
		this.owner = et2_createWidget('select-account_ro',{},this);

		this._labelContainer = $j(document.createElement("label"))
			.addClass("et2_label")
			.appendTo(this.gridHeader);
		
		// List of dates in Ymd
		// The first one should be start_date, last should be end_date
		this.day_list = [];
		this.day_widgets = [];

		// Update timer, to avoid redrawing twice when changing start & end date
		this.update_timer = null;

		// Timer to re-scale time to fit
		this.resize_timer = null;

		this.setDOMNode(this.div[0]);
	},
	destroy: function() {
		
		// Stop listening to tab changes
		if(framework.getApplicationByName('calendar').tab)
		{
			$j(framework.getApplicationByName('calendar').tab.contentDiv).off('show.' + this.id);
		}

		this._super.apply(this, arguments);

		// Delete all old objects
		this._actionObject.clear();
		this._actionObject.unregisterActions();
		this._actionObject.remove();
		this._actionObject = null;

		this.div.off();
		this.div = null;
		this.gridHeader = null;
		this.dayHeader = null;
		this.days = null;
		this.scrolling = null;
		this._labelContainer = null;

		// Stop the resize timer
		if(this.resize_timer)
		{
			window.clearTimeout(this.resize_timer);
		}
	},

	doLoadingFinished: function() {
		this._super.apply(this, arguments);

		// Listen to tab show to make sure we scroll to the day start, not top
		if(framework.getApplicationByName('calendar').tab)
		{
			$j(framework.getApplicationByName('calendar').tab.contentDiv)
				.on('show.' + this.id, jQuery.proxy(
					function()
					{
						if(this.scrolling)
						{
							this.scrolling.scrollTop(this._top_time);
						}
					},this)
				);
		}

		// Need to get the correct internal sizing
		this.resize();

		this._drawGrid();

		// Actions may be set on a parent, so we need to explicitly get in here
		// and get ours
		this._link_actions(this.options.actions || this._parent.options.actions || []);

		// Automatically bind drag and resize for every event using jQuery directly
		// - no action system -
		var timegrid = this;

		/**
		 * If user puts the mouse over an event, then we'll set up resizing so
		 * they can adjust the length.  Should be a little better on resources
		 * than binding it for every calendar event, and we won't need exceptions
		 * for planner view to resize horizontally.
		 */
		this.div.on('mouseover', '.calendar_calEvent:not(.ui-resizable):not(.rowNoEdit)', function() {
			// Only resize in timegrid
			if(timegrid.options.granularity === 0) return;
			
			// Load the event
			timegrid._get_event_info(this);
			var that = this;

			//Resizable event handler
			$j(this).resizable
			({
				distance: 10,
				// Grid matching preference
				grid: [10000,timegrid.rowHeight],
				autoHide: false,
				handles: 's,se',
				containment:'parent',

				/**
				 *  Triggered when the resizable is created.
				 *
				 * @param {event} event
				 * @param {Object} ui
				 */
				create:function(event, ui)
				{
					var resizeHelper = event.target.getAttribute('data-resize');
					if (resizeHelper == 'WD' || resizeHelper == 'WDS')
					{
						jQuery(this).resizable('destroy');
					}
				},

				/**
				 * Triggered at the end of resizing the calEvent.
				 *
				 * @param {event} event
				 * @param {Object} ui
				 */
				stop:function(event, ui)
				{
					var e = new jQuery.Event('change');
					e.originalEvent = event;
					e.data = {duration: 0};
					var event_data = timegrid._get_event_info(this);
					var event_widget = timegrid.getWidgetById(event_data.widget_id);
					var sT = event_widget.options.value.start_m;
					if (typeof this.dropEnd != 'undefined' && this.dropEnd.length == 1)
					{
						var eT = parseInt(this.dropEnd.attr('data-hour') * 60) + parseInt(this.dropEnd.attr('data-minute'));
						e.data.duration = ((eT - sT)/60) * 3600;

						if(event_widget)
						{
							event_widget.options.value.end_m = eT;
							event_widget.options.value.duration = e.data.duration;
						}
						$j(this).trigger(e);
						event_widget._update(event_widget.options.value);

						// That cleared the resize handles, so remove for re-creation...
						if($j(this).resizable('instance'))
						{
							$j(this).resizable('destroy');
						}
					}
					// Clear the helper, re-draw
					if(event_widget && event_widget._parent)
					{
						event_widget._parent.position_event(event_widget);
					}
					timegrid.div.children('.drop-hover').removeClass('.drop-hover');
				},

				/**
				 * Triggered during the resize, on the drag of the resize handler
				 *
				 * @param {event} event
				 * @param {Object} ui
				 */
				resize:function(event, ui)
				{
					// Add 5px to make sure it doesn't land right on the edge of a div
					var drop = timegrid._drag_helper(this,ui.element[0],ui.helper.outerHeight()+5);
					if(drop && !drop.is(':visible'))
					{
						drop.get(0).scrollIntoView(false);
					}
				}	 
			});
		});
		
		// Customize and override some draggable settings
		this.div
			.on('dragcreate','.calendar_calEvent', function(event, ui) {
				$j(this).draggable('option','cancel','.rowNoEdit');
				// Act like you clicked the header, makes it easier to position
				$j(this).draggable('option','cursorAt', {top: 5, left: 5});
			})
			.on('dragstart', '.calendar_calEvent', function(event,ui) {
				$j('.calendar_calEvent',ui.helper).width($j(this).width())
					.height($j(this).outerHeight())
					.css('top', '').css('left','')
					.appendTo(ui.helper);
				ui.helper.width($j(this).width());
			});
		return true;
	},

	/**
	 * Show the current time while dragging
	 * Used for resizing as well as drag & drop
	 */
	_drag_helper: function(element, helper,height)
	{
		if(!element) return;
		
		element.dropEnd = this._get_time_from_position(helper.getBoundingClientRect().left,
			helper.getBoundingClientRect().top+parseInt(height));

		if(element.dropEnd.length)
		{
			this._drop_data = element.dropEnd[0].dataset || {};
		}

		if (typeof element.dropEnd != 'undefined' && element.dropEnd.length)
		{
			element.dropEnd.addClass("drop-hover");

			// Make sure the target is visible in the scrollable day
			var scrollto = element.dropEnd.next() ? element.dropEnd.next() : element.dropEnd;
			if(this.scrolling.find(element.dropEnd).length == element.dropEnd.length)
			{
				if(scrollto.length && this.scrolling.height() + this.scrolling.scrollTop() < scrollto.position().top+scrollto.height() )
				{
					scrollto.get(0).scrollIntoView(false);
				}
				else if(element.dropEnd.position().top < this.scrolling[0].scrollTop)
				{
					this.scrolling.scrollTop(element.dropEnd.position().top);
				}
				else if (element.dropEnd.prev().length && element.dropEnd.prev().position().top < this.scrolling[0].scrollTop)
				{
					this.scrolling.scrollTop(element.dropEnd.prev().position().top);
				}
			}
			var time = '';
			if(this._drop_data.whole_day)
			{
				time = this.egw().lang('Whole day');
			}
			else if (this.options.granularity === 0)
			{
				// No times, keep what's in the event
				// Add class to helper to keep formatting
				$j(helper).addClass('calendar_calTimeGridList');
			}
			else
			{
				time = jQuery.datepicker.formatTime(
					egw.preference("timeformat") === "12" ? "h:mmtt" : "HH:mm",
					{
						hour: element.dropEnd.attr('data-hour'),
						minute: element.dropEnd.attr('data-minute'),
						seconds: 0,
						timezone: 0
					},
					{"ampm": (egw.preference("timeformat") == "12")}
				);
			}
			element.innerHTML = '<div style="font-size: 1.1em; text-align:center; font-weight: bold; height:100%;"><span class="calendar_timeDemo" >'+time+'</span></div>';
		}
		else
		{
			element.innerHTML = '<div class="calendar_d-n-d_forbiden" style="height:100%"></div>';
		}
		$j(element).width($j(helper).width());
		return element.dropEnd;
	},

	/**
	 * Handler for dropping an event on the timegrid
	 */
	_event_drop: function(timegrid, event,ui, dropEnd) {
		var e = new jQuery.Event('change');
		e.originalEvent = event;
		e.data = {start: 0};

		if(typeof dropEnd != 'undefined' && dropEnd)
		{
			var drop_date = dropEnd.date||false;

			var event_data = timegrid._get_event_info(ui.draggable);
			var event_widget = timegrid.getWidgetById(event_data.widget_id);
			if(!event_widget)
			{
				// Widget was moved across weeks / owners
				event_widget = timegrid.getParent().getWidgetById(event_data.widget_id);
			}
			if(event_widget)
			{
				event_widget._parent.date_helper.set_year(drop_date.substring(0,4));
				event_widget._parent.date_helper.set_month(drop_date.substring(4,6));
				event_widget._parent.date_helper.set_date(drop_date.substring(6,8));
				// Make sure whole day events stay as whole day events by ignoring drop time
				if(event_data.app == 'calendar' && event_widget.options.value.whole_day)
				{
					event_widget._parent.date_helper.set_hours(0);
					event_widget._parent.date_helper.set_minutes(0);
				}
				else if (timegrid.options.granularity === 0)
				{
					// List, not time grid - keep time
					event_widget._parent.date_helper.set_hours(event_widget.options.value.start.getUTCHours());
					event_widget._parent.date_helper.set_minutes(event_widget.options.value.start.getUTCMinutes());
				}
				else
				{
					// Non-whole day events, and integrated apps, can change
					event_widget._parent.date_helper.set_hours(dropEnd.whole_day ? 0 : dropEnd.hour||0);
					event_widget._parent.date_helper.set_minutes(dropEnd.whole_day ? 0 : dropEnd.minute||0);
				}
								
				// Leave the helper there until the update is done
				var loading = ui.helper.clone(true).appendTo($j('body'));
				// and add a loading icon so user knows something is happening
				if($j('.calendar_timeDemo',loading).length == 0)
				{
					$j('.calendar_calEventHeader',loading).addClass('loading');
				}
				else
				{
					$j('.calendar_timeDemo',loading).after('<div class="loading"></div>');
				}
				
				event_widget.recur_prompt(function(button_id) {
					if(button_id === 'cancel' || !button_id)
					{
						// Need to refresh the event with original info to clean up
						var app_id = event_widget.options.value.app_id ? event_widget.options.value.app_id : event_widget.options.value.id + (event_widget.options.value.recur_type ? ':'+event_widget.options.value.recur_date : '');
						egw().dataStoreUID('calendar::'+app_id,egw.dataGetUIDdata('calendar::'+app_id).data);
						loading.remove();
						return;
					}
					//Get infologID if in case if it's an integrated infolog event
					if (event_data.app === 'infolog')
					{
						// Duration - infologs are always non-blocking
						var duration = dropEnd.whole_day ? 86400-1 : (
							event_widget.options.value.whole_day ? (egw().preference('defaultlength','calendar')*60) : false);

						// If it is an integrated infolog event we need to edit infolog entry
						egw().json('stylite_infolog_calendar_integration::ajax_moveInfologEvent',
							[event_data.app_id, event_widget._parent.date_helper.getValue()||false,duration],
							function() {loading.remove();}
						).sendRequest(true);
					}
					else
					{
						//Edit calendar event
						
						// Duration - check for whole day dropped on a time, change it to full day
						var duration = event_widget.options.value.whole_day && dropEnd.hour ? 86400-1 : false;
						// Event (whole day or not) dropped on whole day section, change to whole day non blocking
						if(dropEnd.whole_day) duration = 'whole_day';
						
						// Send the update
						var _send = function(series_instance)
						{
							var start = new Date(event_widget._parent.date_helper.getValue());

							egw().json('calendar.calendar_uiforms.ajax_moveEvent', [
									button_id==='series' ? event_data.id : event_data.app_id,event_data.owner,
									start,
									timegrid.options.owner||egw.user('account_id'),
									duration,
									series_instance
								],
								function() { loading.remove();}
							).sendRequest(true);
						};

						// Check for modifying a series that started before today
						if (event_widget.options.value.recur_type && button_id === 'series')
						{
							event_widget.series_split_prompt(function(_button_id) {
								if (_button_id === et2_dialog.OK_BUTTON)
								{
									_send(event_widget.options.value.recur_date);
								}
								else
								{
									loading.remove();
								}
							});
						}
						else
						{
							_send(event_widget.options.value.recur_date);
						}
					}
				});
			}
		}
	},

	/**
	 * Something changed, and the days need to be re-drawn.  We wait a bit to
	 * avoid re-drawing twice if start and end date both changed, then recreate
	 * the days.
	 * The whole grid is not regenerated because times aren't expected to change,
	 * just the days.
	 *
	 * @param {boolean} [trigger=false] Trigger an event once things are done.
	 *	Waiting until invalidate completes prevents 2 updates when changing the date range.
	 * @returns {undefined}
	 */
	invalidate: function(trigger) {

		// Reset the list of days
		this.day_list = [];

		// Wait a bit to see if anything else changes, then re-draw the days
		if(this.update_timer)
		{
			window.clearTimeout(this.update_timer);
		}
		this.update_timer = window.setTimeout(jQuery.proxy(function() {
			this.widget.update_timer = null;
			window.clearTimeout(this.resize_timer);
			this.widget.loader.hide().show();
			
			// Update actions
			if(this.widget._actionManager)
			{
				this.widget._link_actions(this.widget._actionManager.children);
			}

			this.widget._drawDays();
			// We have to completely re-do times, as they may have changed in
			// scale to the point where more labels are needed / need to be removed
			this.widget._drawTimes();
			if(this.trigger)
			{
				this.widget.change();
			}
			// Hide loader
			window.setTimeout(jQuery.proxy(function() {this.loader.hide();},this.widget),100);
		},{widget:this,"trigger":trigger}),ET2_GRID_INVALIDATE_TIMEOUT);
	},

	detachFromDOM: function() {
		// Remove the binding to the change handler
		$j(this.div).off(".et2_calendar_timegrid");

		this._super.apply(this, arguments);
	},

	attachToDOM: function() {
		this._super.apply(this, arguments);

		// Add the binding for the event change handler
		$j(this.div).on("change.et2_calendar_timegrid", '.calendar_calEvent', this, function(e) {
			// Make sure function gets a reference to the widget
			var args = Array.prototype.slice.call(arguments);
			if(args.indexOf(this) == -1) args.push(this);

			return e.data.event_change.apply(e.data, args);
		});

		// Add the binding for the change handler
		$j(this.div).on("change.et2_calendar_timegrid", '*:not(.calendar_calEvent)', this, function(e) {
			return e.data.change.call(e.data, e, this);
		});

		// Catch resize and prevent it from bubbling further, triggering
		// etemplate's resize
		this.div.on('resize', this, function(e) {
			e.stopPropagation();
		});
	},

	getDOMNode: function(_sender) {
		if(_sender === this || !_sender)
		{
			return this.div ? this.div[0] : null;
		}
		else if (_sender.instanceOf(et2_calendar_daycol))
		{
			return this.days ? this.days[0] : null;
		}
		else if (_sender)
		{
			return this.gridHeader ? this.gridHeader[0] : null;
		}
	},

	set_disabled: function(disabled) {
		this._super.apply(this, arguments);
		if(disabled)
		{
			this.loader.show();
		}
	},

	/**
	 * Clear everything, and redraw the whole grid
	 */
	_drawGrid: function() {

		this.div.css('height', this.options.height)
			.empty();
		this.loader.prependTo(this.div).show();

		// Draw in the horizontal - the times
		this._drawTimes();

		// Draw in the vertical - the days
		this.invalidate();
	},

	/**
	 * Creates the DOM nodes for the times in the left column, and the horizontal
	 * lines (mostly via CSS) that span the whole date range.
	 */
	_drawTimes: function() {
		$j('.calendar_calTimeRow',this.div).remove();

		this.div.toggleClass('calendar_calTimeGridList', this.options.granularity === 0);

		this.gridHeader
			.attr('data-date', this.options.start_date)
			.attr('data-owner', this.options.owner)
			.append(this._labelContainer)
			.append(this.owner.getDOMNode())
			.append(this.dayHeader)
			.appendTo(this.div);
		
		// Max with 18 avoids problems when it's not shown
		var header_height = Math.max(this.gridHeader.outerHeight(true), 18);
		
		this.scrolling
			.appendTo(this.div)
			.off()

		// No time grid - list
		if(this.options.granularity === 0)
		{
			this.scrolling.css('height','100%');
			this.days.css('height', '100%');
			this.iterateOver(function(day) {
				day.resize();
			},this,et2_calendar_daycol);
			return;
		}

		var wd_start = 60*this.options.day_start;
		var wd_end = 60*this.options.day_end;
		var granularity = this.options.granularity;
		var totalDisplayMinutes	= wd_end - wd_start;
		var rowsToDisplay	= Math.ceil((totalDisplayMinutes+60)/granularity);

		
		this.scrolling
			.css('height', (this.div.innerHeight() - header_height)+'px')
			.on('scroll', jQuery.proxy(this._scroll, this));

		// Percent
		var rowHeight = (100/rowsToDisplay).toFixed(1);
		// Pixels
		this.rowHeight = this.scrolling.height() / rowsToDisplay;

		// We need a reasonable bottom limit here...
		if(this.rowHeight < 5 && this.div.is(':visible'))
		{
			if(this.rowHeight === 0)
			{
				// Something is not right...
				this.rowHeight = 5;
			}
			else
			{
				this.options.granularity *= 2;
				return this._drawTimes();
			}
		}

		// the hour rows
		var show = {
			5  : [0,15,30,45],
			10 : [0,30],
			15 : [0,30],
			45 : [0,15,30,45]
		};
		var html = '';
		var line_height = parseInt(this.div.css('line-height'));
		this._top_time = 0
		for(var t = 0,i = 0; t < 1440; t += granularity,++i)
		{
			html += '<div class="calendar_calTimeRow" style="height: '+this.rowHeight+'px;">';
			// show time for full hours, always for 45min interval and at least on every 3 row
			var time = jQuery.datepicker.formatTime(
					egw.preference("timeformat") === "12" ? "h:mmtt" : "HH:mm",
					{
						hour: t / 60,
						minute: t % 60,
						seconds: 0,
						timezone: 0
					},
					{"ampm": (egw.preference("timeformat") === "12")}
				);
			if(t <= wd_start && t + granularity > wd_start)
			{
				this._top_time = this.rowHeight * (i+1+(wd_start - (t+granularity))/granularity)
			}

			var time_label = (typeof show[granularity] === 'undefined' ? t % 60 === 0 : show[granularity].indexOf(t % 60) !== -1) ? time : '';
			if(time_label && egw.preference("timeformat") == "12" && time_label.split(':')[0] < 10)
			{
				time_label ='&nbsp;&nbsp;' + time_label;
			}
			if(this.rowHeight < line_height)
			{
				// Rows too small for regular label frequency, use automatic calculation
				time_label = ( i % Math.ceil(line_height / this.rowHeight) ) === 0 ? time : '';
			}
			html += '<div class="calendar_calTimeRowTime et2_clickable" data-time="'+time.trim()+'" data-hour="'+Math.floor(t/60)+'" data-minute="'+(t%60)+'">'+time_label+"</div></div>\n";
		}

		// Set heights in pixels for scrolling
		$j('.calendar_calTimeLabels',this.scrolling)
			.empty()
			.append(html);
		this.days.css('height', (this.rowHeight*i)+'px');

		// Scroll to start of day
		this.scrolling.scrollTop(this._top_time);
	},

	/**
	 * As window size and number of all day non-blocking events change, we need
	 * to re-scale the time grid to make sure the full working day is shown.
	 *
	 * We use a timeout to avoid doing it multiple times if redrawing or resizing.
	 */
	resizeTimes: function() {
		// Wait a bit to see if anything else changes, then re-draw the times
		if(this.resize_timer)
		{
			window.clearTimeout(this.resize_timer);
		}
		// No point if it is just going to be redone completely
		if(this.upate_timer) return;
		
		this.resize_timer = window.setTimeout(jQuery.proxy(function() {
			if(this._resizeTimes)
			{
				this.resize_timer = null;

				this._resizeTimes();
			}
		},this),1);
	},

	/**
	 * Re-scale the time grid to make sure the full working day is shown.
	 * This is the timeout callback that does the actual re-size immediately.
	 */
	_resizeTimes: function() {

		if(!this.div.is(':visible'))
		{
			return;
		}
		var wd_start = 60*this.options.day_start;
		var wd_end = 60*this.options.day_end;
		var totalDisplayMinutes	= wd_end - wd_start;
		var rowsToDisplay	= Math.ceil((totalDisplayMinutes+60)/this.options.granularity);
		this.scrolling
			.css('height', (this.options.height - this.gridHeader.outerHeight(true))+'px');

		var new_height = this.scrolling.height() / rowsToDisplay;
		this.rowHeight = new_height;
		var rows = $j('.calendar_calTimeRow',this.scrolling).height(this.rowHeight);
		if(!rows.length && this.options.granularity)
		{
			return this._drawTimes();
		}
		this.days.css('height', this.options.granularity === 0 ?
			'100%' :
			(this.rowHeight*rows.length)+'px'
		);
		$j('.calendar_calAddEvent',this.scrolling).height(this.rowHeight);
		
		// Scroll to start of day
		this._top_time = (wd_start * this.rowHeight) / this.options.granularity;
		this.scrolling.scrollTop(this._top_time);

		this.iterateOver(function(child) {
			child.resize();
		},this, et2_IResizeable);
	},

	/**
	 * Set up the needed day widgets to correctly display the selected date
	 * range.  First we calculate the needed dates, then we create any needed
	 * widgets.  Existing widgets are recycled rather than discarded.
	 */
	_drawDays: function() {
		this.scrolling.append(this.days);
		
		// If day list is still empty, recalculate it from start & end date
		if(this.day_list.length === 0 && this.options.start_date && this.options.end_date)
		{
			this.day_list = this._calculate_day_list(this.options.start_date, this.options.end_date, this.options.show_weekend);
		}
		// For a single day, we show each owner in their own daycol
		var daily_owner = this.day_list.length === 1 && 
			this.options.owner.length > 1 &&
			this.options.owner.length < (parseInt(egw.preference('day_consolidate','calendar')) || 6);
		var daycols_needed = daily_owner ? this.options.owner.length : this.day_list.length;
		var day_width = ( Math.min( $j(this.getInstanceManager().DOMContainer).width(),this.days.width())/daycols_needed);
		if(!day_width || !this.day_list)
		{
			// Hidden on another tab, or no days for some reason
			var dim = egw.getHiddenDimensions(this.days, false);
			day_width = ( dim.w /Math.max(daycols_needed,1));
		}

		// Create any needed widgets - otherwise, we'll just recycle
		// Add any needed day widgets (now showing more days)
		var add_index = 0;
		var before = true;

		while(daycols_needed > this.day_widgets.length)
		{
			var existing_index = this.day_widgets[add_index] && !daily_owner ? this.day_list.indexOf(this.day_widgets[add_index].options.date) : -1;
			before = existing_index > add_index;
			
			var day = et2_createWidget('calendar-daycol',{
				owner: this.options.owner,
				width: (before ? 0 : day_width) + "px"
			},this);
			if(this.isInTree())
			{
				day.doLoadingFinished();
			}
			if(existing_index != -1 && parseInt(this.day_list[add_index]) < parseInt(this.day_list[existing_index]))
			{
				this.day_widgets.unshift(day);
				$j(this.getDOMNode(day)).prepend(day.getDOMNode(day));
			}
			else
			{
				this.day_widgets.push(day);
			}
			add_index++;
		}
		// Remove any extra day widgets (now showing less)
		var delete_index = this.day_widgets.length - 1;
		before = false;
		while(this.day_widgets.length > daycols_needed)
		{
			// If we're going down to an existing one, just keep it for cool CSS animation
			while(delete_index > 1 && this.day_list.indexOf(this.day_widgets[delete_index].options.date) > -1)
			{
				delete_index--;
				before = true;
			}
			if(delete_index < 0) delete_index = 0;

			// Widgets that are before our date shrink, after just get pushed out
			if(before)
			{
				this.day_widgets[delete_index].set_width('0px');
			}
			this.day_widgets[delete_index].div.hide();
			this.day_widgets[delete_index].header.hide();
			this.day_widgets[delete_index].destroy();
			this.day_widgets.splice(delete_index--,1);
		}
		
		// Create / update day widgets with dates and data
		for(var i = 0; i < this.day_widgets.length; i++)
		{
			day = this.day_widgets[i];

			// Classes
			if(this.day_list[i] && parseInt(this.day_list[i].substr(4,2)) !== new Date(app.calendar.state.date).getUTCMonth()+1)
			{
				day.set_class('calendar_differentMonth');
			}
			else
			{
				day.set_class('');
			}

			// Position
			day.set_left((day_width * i) + 'px');
			if(daily_owner)
			{
				// Each 'day' is the same date, different user
				day.set_id(this.day_list[0]+'-'+this.options.owner[i]);
				day.set_date(this.day_list[0], false);
				day.set_owner(this.options.owner[i]);
				day.set_label(this._get_owner_name(this.options.owner[i]));
			}
			else
			{
				// Go back to self-calculated date by clearing the label
				day.set_label('');
				day.set_id(this.day_list[i]);
				day.set_date(this.day_list[i], this.value[this.day_list[i]] || false);
				day.set_owner(this.options.owner);
			}
			day.set_width(day_width + 'px');
		}

		// Adjust and scroll to start of day
		this.resizeTimes();
		
		// Don't hold on to value any longer, use the data cache for best info
		this.value = {};

		if(daily_owner)
		{
			this.set_label('');
		}

		// Handle not fully visible elements
		this._scroll();
		
		// TODO: Figure out how to do this with detached nodes
		/*
		var nodes = this.day_col.getDetachedNodes();
		var supportedAttrs = [];
		this.day_col.getDetachedAttributes(supportedAttrs);
		supportedAttrs.push("id");

		for(var i = 0; i < day_count; i++)
		{
			this.day_col.setDetachedAttributes(nodes.clone(),)
		}
		*/
	},

	/**
	 * Update UI while scrolling within the selected time
	 * 
	 * Toggles out of view indicators and adjusts not visible headers
	 * @param {Event} event Scroll event
	 */
	_scroll: function(event)
	{
		// Loop through days, let them deal with it
		for(var day = 0; day < this.day_widgets.length; day++)
		{
			this.day_widgets[day]._out_of_view();
		}
	},

	/**
	 * Calculate a list of days between start and end date, skipping weekends if
	 * desired.
	 *
	 * @param {Date|string} start_date Date that et2_date widget can understand
	 * @param {Date|string} end_date Date that et2_date widget can understand
	 * @param {boolean} show_weekend If not showing weekend, Saturday and Sunday
	 *	will not be in the returned list.
	 *	
	 * @returns {string[]} List of days in Ymd format
	 */
	_calculate_day_list: function(start_date, end_date, show_weekend) {
		
		var day_list = [];
		
		this.date_helper.set_value(end_date);
		var end = this.date_helper.date.getTime();
		var i = 1;
		this.date_helper.set_value(new Date(start_date));

		do
		{
			if(show_weekend || !show_weekend && [0,6].indexOf(this.date_helper.date.getUTCDay()) === -1 || end_date == start_date)
			{
				day_list.push(''+this.date_helper.get_year() + sprintf('%02d',this.date_helper.get_month()) + sprintf('%02d',this.date_helper.get_date()));
			}
			this.date_helper.set_date(this.date_helper.get_date()+1);
		}
		// Limit it to 14 days to avoid infinite loops in case something is mis-set,
		// though the limit is more based on how wide the screen is
		while(end >= this.date_helper.date.getTime() && i <= 14)

		return day_list;
	},

	/**
	 * Link the actions to the DOM nodes / widget bits.
	 *
	 * @param {object} actions {ID: {attributes..}+} map of egw action information
	 */
	_link_actions: function(actions)
	{
		// Get the parent?  Might be a grid row, might not.  Either way, it is
		// just a container with no valid actions
		var objectManager = egw_getObjectManager(this.getInstanceManager().app,true,1);
		objectManager = objectManager.getObjectById(this.getInstanceManager().uniqueId,2) || objectManager;
		var parent = objectManager.getObjectById(this.id,1) || objectManager.getObjectById(this._parent.id,1) || objectManager;
		if(!parent)
		{
			debugger;
			egw.debug('error','No parent objectManager found')
			return;
		}
		
		for(var i = 0; i < parent.children.length; i++)
		{
			var parent_finder = jQuery(this.div, parent.children[i].iface.doGetDOMNode());
			if(parent_finder.length > 0)
			{
				parent = parent.children[i];
				break;
			}
		}

		// This binds into the egw action system.  Most user interactions (drag to move, resize)
		// are handled internally using jQuery directly.
		var widget_object = this._actionObject || parent.getObjectById(this.id);
		var aoi = new et2_action_object_impl(this,this.getDOMNode());
		
		aoi.doTriggerEvent = function(_event, _data) {
			// Determine target node
			var event = _data.event || false;
			if(!event) return;
			if(_data.ui.draggable.hasClass('rowNoEdit')) return;
			
			/*
			We have to handle the drop in the normal event stream instead of waiting
			for the egwAction system so we can get the helper, and destination
			*/
			if(event.type === 'drop')
			{
				var dropEnd = false;
				var helper = $j('.calendar_d-n-d_timeCounter',_data.ui.helper)[0];
				if(helper && helper.dropEnd && helper.dropEnd.length >= 1)
				if (typeof this.dropEnd != 'undefined' && this.dropEnd.length >= 1)
				{
					dropEnd = helper.dropEnd[0].dataset || false;
				}
				this.getWidget()._event_drop.call($j('.calendar_d-n-d_timeCounter',_data.ui.helper)[0],this.getWidget(),event, _data.ui, dropEnd);
			}
			var drag_listener = function(event, ui) {
				aoi.getWidget()._drag_helper($j('.calendar_d-n-d_timeCounter',ui.helper)[0],ui.helper[0],0);
			};
			var time = $j('.calendar_d-n-d_timeCounter',_data.ui.helper);
			switch(_event)
			{
				// Triggered once, when something is dragged into the timegrid's div
				case EGW_AI_DRAG_OVER:
					// Listen to the drag and update the helper with the time
					// This part lets us drag between different timegrids
					_data.ui.draggable.on('drag.et2_timegrid'+widget_object.id, drag_listener);
					_data.ui.draggable.on('dragend.et2_timegrid'+widget_object.id, function() {
						_data.ui.draggable.off('drag.et2_timegrid' + widget_object.id);
					});

					// Remove formatting for out-of-view events (full day non-blocking)
					$j('.calendar_calEventHeader',_data.ui.helper).css('top','');
					$j('.calendar_calEventBody',_data.ui.helper).css('padding-top','');
					
					if(time.length)
					{
						// The out will trigger after the over, so we count
						time.data('count',time.data('count')+1);
					}
					else
					{
						_data.ui.helper.prepend('<div class="calendar_d-n-d_timeCounter" data-count="1"><span></span></div>');
					}

					break;

				// Triggered once, when something is dragged out of the timegrid
				case EGW_AI_DRAG_OUT:
					// Stop listening
					_data.ui.draggable.off('drag.et2_timegrid'+widget_object.id);
					// Remove any highlighted time squares
					$j('[data-date]',this.doGetDOMNode()).removeClass("ui-state-active");

					// Out triggers after the over, count to not accidentally remove
					time.data('count',time.data('count')-1);
					if(time.length && time.data('count') <= 0)
					{
						time.remove();
					}
					break;
			}
		};
		
		if (widget_object == null) {
			// Add a new container to the object manager which will hold the widget
			// objects
			widget_object = parent.insertObject(false, new egwActionObject(
				this.id, parent, aoi,
				this._actionManager|| parent.manager.getActionById(this.id) || parent.manager
			));
		}
		else
		{
			widget_object.setAOI(aoi);
		}
		this._actionObject = widget_object;
		
		// Delete all old objects
		widget_object.clear();
		widget_object.unregisterActions();

		// Go over the widget & add links - this is where we decide which actions are
		// 'allowed' for this widget at this time
		var action_links = this._get_action_links(actions);

		this._init_links_dnd(widget_object.manager, action_links);
		
		widget_object.updateActionLinks(action_links);
	},

	/**
	 * Automatically add dnd support for linking
	 */
	_init_links_dnd: function(mgr,actionLinks) {
		var self = this;

		var drop_action = mgr.getActionById('egw_link_drop');
		var drag_action = mgr.getActionById('egw_link_drag');

		// Check if this app supports linking
		if(!egw.link_get_registry(this.dataStorePrefix || 'calendar', 'query') ||
			egw.link_get_registry(this.dataStorePrefix || 'calendar', 'title'))
		{
			if(drop_action)
			{
				drop_action.remove();
				if(actionLinks.indexOf(drop_action.id) >= 0)
				{
					actionLinks.splice(actionLinks.indexOf(drop_action.id),1);
				}
			}
			if(drag_action)
			{
				drag_action.remove();
				if(actionLinks.indexOf(drag_action.id) >= 0)
				{
					actionLinks.splice(actionLinks.indexOf(drag_action.id),1);
				}
			}
			return;
		}

		// Don't re-add
		if(drop_action == null)
		{
			// Create the drop action that links entries
			drop_action = mgr.addAction('drop', 'egw_link_drop', egw.lang('Create link'), egw.image('link'), function(action, source, target) {

				// Extract link IDs
				var links = [];
				var id = '';
				for(var i = 0; i < source.length; i++)
				{
					// Check for no ID (invalid) or same manager (dragging an event)
					if(!source[i].id) continue;
					if(source[i].manager === target.manager)
					{
						// Find the timegrid, could have dropped on an event
						var timegrid = target.iface.getWidget();
						while(target.parent && timegrid.instanceOf && !timegrid.instanceOf(et2_calendar_timegrid))
						{
							target = target.parent;
							timegrid = target.iface.getWidget();
						}


						if (timegrid && timegrid._drop_data)
						{
							timegrid._event_drop.call(source[i].iface.getDOMNode(),timegrid,null, action.ui,timegrid._drop_data);
						}
						timegrid._drop_data = false;
						// Ok, stop.
						return false;
					}
					
					id = source[i].id.split('::');
					links.push({app: id[0] == 'filemanager' ? 'link' : id[0], id: id[1]});
				}
				if(links.length && target && target.iface.getWidget() && target.iface.getWidget().instanceOf(et2_calendar_event))
				{
					// Link the entries
					egw.json(self.egw().getAppName()+".etemplate_widget_link.ajax_link.etemplate",
						target.id.split('::').concat([links]),
						function(result) {
							if(result)
							{
								this.egw().message('Linked');
							}
						},
						self,
						true,
						self
					).sendRequest();
				}
				else if (links.length)
				{
					// Get date and time
					var params = jQuery.extend({},$j('.drop-hover[data-date]',target.iface.getDOMNode())[0].dataset || {});
					
					// Add link IDs
					var app_registry = egw.link_get_registry('calendar');
					params[app_registry.add_app] = [];
					params[app_registry.add_id] = [];
					for(var n in links)
					{
						params[app_registry.add_app].push( links[n].app);
						params[app_registry.add_id].push( links[n].id);
					}
					egw.open('','calendar','add',params);
				}

			},true);
		}
		if(actionLinks.indexOf(drop_action.id) < 0)
		{
			actionLinks.push(drop_action.id);
		}
		// Accept other links, and files dragged from the filemanager
		// This does not handle files dragged from the desktop.  They are
		// handled by et2_nextmatch, since it needs DOM stuff
		if(drop_action.acceptedTypes.indexOf('link') == -1)
		{
			drop_action.acceptedTypes.push('link');
		}

		// Don't re-add
		if(drag_action == null)
		{
			// Create drag action that allows linking
			drag_action = mgr.addAction('drag', 'egw_link_drag', egw.lang('link'), 'link', function(action, selected) {
				// Drag helper - list titles.
				// As we wanted to have a general defaul helper interface, we return null here and not using customize helper for links
				// TODO: Need to decide if we need to create a customized helper interface for links anyway
				//return helper;
				return null;
			},true);
		}
		// The timegrid itself is not draggable, so don't add a link.
		// The action is there for the children (events) to use
		if(false && actionLinks.indexOf(drag_action.id) < 0)
		{
			actionLinks.push(drag_action.id);
		}
		drag_action.set_dragType('link');
	},

	/**
	 * Get all action-links / id's of 1.-level actions from a given action object
	 *
	 * Here we are only interested in drop events.
	 *
	 * @param actions
	 * @returns {Array}
	 */
	_get_action_links: function(actions)
	{
		var action_links = [];
		// TODO: determine which actions are allowed without an action (empty actions)
		for(var i in actions)
		{
			var action = actions[i];
			if(action.type == 'drop')
			{
				action_links.push(typeof action.id != 'undefined' ? action.id : i);
			}
		}
		return action_links;
	},

	/**
	 * Provide specific data to be displayed.
	 * This is a way to set start and end dates, owner and event data in one call.
	 *
	 * Events will be retrieved automatically from the egw.data cache, so there
	 * is no great need to provide them.
	 * 
	 * @param {Object[]} events Array of events, indexed by date in Ymd format:
	 *	{
	 *		20150501: [...],
	 *		20150502: [...]
	 *	}
	 *	Days should be in order.
	 * @param {string|number|Date} events.start_date - New start date
	 * @param {string|number|Date} events.end_date - New end date
	 * @param {number|number[]|string|string[]} event.owner - Owner ID, which can
	 *	be an account ID, a resource ID (as defined in calendar_bo, not
	 *	necessarily an entry from the resource app), or a list containing a
	 *	combination of both.
	 */
	set_value: function(events)
	{
		if(typeof events !== 'object') return false;
	
		var use_days_sent = true;

		if(events.start_date)
		{
			use_days_sent = false;
		}
		if(events.end_date)
		{
			use_days_sent = false;
		}

		this._super.apply(this,arguments);
		
		if(use_days_sent)
		{
			var day_list = Object.keys(events);
			if(day_list.length)
			{
				this.set_start_date(day_list[0]);
				this.set_end_date(day_list[day_list.length-1]);
			}

			// Sub widgets actually get their own data from egw.data, so we'll
			// stick it there
			var consolidated = et2_calendar_view.is_consolidated(this.options.owner, this.day_list.length == 1 ? 'day' : 'week');
			for(var day in events)
			{
				var day_list = [];
				for(var i = 0; i < events[day].length; i++)
				{
					day_list.push(events[day][i].row_id);
					egw.dataStoreUID('calendar::'+events[day][i].row_id, events[day][i]);
				}
				// Might be split by user, so we have to check that too
				for(var i = 0; i < this.options.owner.length; i++)
				{
					var owner = consolidated ? this.options.owner : this.options.owner[i];
					var day_id = app.classes.calendar._daywise_cache_id(day,owner);
					egw.dataStoreUID(day_id, day_list);
					if(consolidated) break;
				}
			}
		}

		// Reset and calculate instead of just use the keys so we can get the weekend preference
		this.day_list = [];

		// None of the above changed anything, hide the loader
		if(!this.update_timer)
		{
			window.setTimeout(jQuery.proxy(function() {this.loader.hide();},this),100);
		}
	},

	/**
	 * Set which user owns this.  Owner is passed along to the individual
	 * days.
	 *
	 * @param {number|number[]} _owner Account ID
	 * @returns {undefined}
	 */
	set_owner: function(_owner)
	{
		var old = this.options.owner || 0;
		this._super.apply(this, arguments);
		
		this.owner.set_label('');
		this.div.removeClass('calendar_TimeGridNoLabel');

		if(typeof _owner == 'string' && isNaN(_owner))
		{
			switch(_owner[0])
			{
				case 'c':
					this.owner.options.application = 'addressbook';
					this.owner.set_value(_owner.substr(1));
					break;
				case 'r':
					this.owner.options.application = 'resources';
					this.owner.set_value(_owner.substr(1));
					break;
			}

			// Label is empty, but give extra space for the owner name
			this.div.removeClass('calendar_TimeGridNoLabel');
		}
		else if (!_owner || typeof _owner == 'object' && _owner.length)
		{
			// Don't show owners if more than one, show week number
			this.owner.set_value('');
			if(this.options.start_date)
			{
				this.set_label(egw.lang('wk') + ' ' +app.calendar.date.week_number(this.options.start_date));
			}
		}
		else
		{
			this.owner.options.application = 'home-accounts'
			this.owner.set_value(typeof _owner == "string" || typeof _owner == "number" ? _owner : jQuery.extend([],_owner));
			this.set_label('');
			$j(this.getDOMNode(this.owner)).prepend(this.owner.getDOMNode());
		}

		if(this.isAttached() && (
			typeof old === "number" && typeof _owner === "number" && old !== this.options.owner ||
			// Array of ids will not compare as equal
			((typeof old === 'object' || typeof _owner === 'object') && old.toString() !== _owner.toString()) ||
			// Strings
			typeof old === 'string' && ''+old !== ''+this.options.owner
		))
		{
			this.invalidate(true);
		}
	},

	/**
	 * Set a label for this week
	 *
	 * May conflict with owner, which is displayed when there's only one owner.
	 *
	 * @param {string} label
	 */
	set_label: function(label)
	{
		this.options.label = label;
		this._labelContainer.html(label);
		this.gridHeader.prepend(this._labelContainer);

		// If it's a short label (eg week number), don't give it an extra line
		// but is empty, but give extra space for a single owner name
		this.div.toggleClass(
			'calendar_TimeGridNoLabel',
			label.trim().length > 0 && label.trim().length < 6 ||
			this.options.owner.length > 1
		);
	},
	
	/**
	 * Set how big the time divisions are
	 *
	 * Setting granularity to 0 will remove the time divisions and display
	 * each days events in a list style.  This 'gridlist' is not to be confused
	 * with the list view, which uses a nextmatch.
	 * 
	 * @param {number} minutes
	 */
	set_granularity: function(minutes)
	{
		// Avoid  < 0
		minutes = Math.max(0,minutes);
		
		if(this.options.granularity !== minutes)
		{
			if(this.options.granularity === 0 || minutes === 0)
			{
				this.options.granularity = minutes;
				// Need to re-do a bunch to make sure this is propagated
				this.invalidate();
			}
			else
			{
				this.options.granularity = minutes;
				this._drawTimes();
			}
		}
		else if (!this.update_timer)
		{
			this.resizeTimes();
		}
	},

	/**
	 * Turn on or off the visibility of weekends
	 *
	 * @param {boolean} weekends
	 */
	set_show_weekend: function(weekends)
	{
		weekends = weekends ? true : false;
		if(this.options.show_weekend !== weekends)
		{
			this.options.show_weekend = weekends;
			if(this.isAttached())
			{
				this.invalidate();
			}
		}
	},

	/**
	 * Call change handler, if set
	 */
	change: function() {
		if (this.onchange)
		{
			if(typeof this.onchange == 'function')
			{
				// Make sure function gets a reference to the widget
				var args = Array.prototype.slice.call(arguments);
				if(args.indexOf(this) == -1) args.push(this);

				return this.onchange.apply(this, args);
			} else {
				return (et2_compileLegacyJS(this.options.onchange, this, _node))();
			}
		}
	},

	/**
	 * Call event change handler, if set
	 */
	event_change: function(event, dom_node) {
		if (this.onevent_change)
		{
			var event_data = this._get_event_info(dom_node);
			var event_widget = this.getWidgetById(event_data.widget_id);
			et2_calendar_event.recur_prompt(event_data, jQuery.proxy(function(button_id, event_data) {
				// No need to continue
				if(button_id === 'cancel') return false;

				if(typeof this.onevent_change == 'function')
				{
					// Make sure function gets a reference to the widget
					var args = Array.prototype.slice.call(arguments);

					if(args.indexOf(event_widget) == -1) args.push(event_widget);

					// Put button ID in event
					event.button_id = button_id;

					return this.onevent_change.apply(this, [event, event_widget, button_id]);
				} else {
					return (et2_compileLegacyJS(this.options.onevent_change, event_widget, dom_node))();
				}
			},this));
		}
		return false;
	},

	get_granularity: function()
	{
		// get option, or user's preference
		if(typeof this.options.granularity === 'undefined')
		{
			this.options.granularity = egw.preference('interval','calendar') || 30;
		}
		return parseInt(this.options.granularity);
	},

	/**
	 * Click handler calling custom handler set via onclick attribute to this.onclick
	 *
	 * This also handles all its own actions, including navigation.  If there is
	 * an event associated with the click, it will be found and passed to the
	 * onclick function.
	 *
	 * @param {Event} _ev
	 * @returns {boolean} Continue processing event (true) or stop (false)
	 */
	click: function(_ev)
	{
		var result = true;
		
		// Is this click in the event stuff, or in the header?
		if($j(_ev.target).hasClass('.calendar_calEvent') || $j(_ev.target).parents('.calendar_calEvent').length)
		{
			// Event came from inside, maybe a calendar event
			var event = this._get_event_info(_ev.originalEvent.target);
			if(typeof this.onclick == 'function')
			{
				// Make sure function gets a reference to the widget, splice it in as 2. argument if not
				var args = Array.prototype.slice.call(arguments);
				if(args.indexOf(this) == -1) args.splice(1, 0, this);

				result = this.onclick.apply(this, args);
			}

			if(event.id && result && !this.disabled && !this.options.readonly)
			{
				et2_calendar_event.recur_prompt(event);

				return false;
			}
			return result;
		}
		else if (this.gridHeader.is(_ev.target) && _ev.target.dataset)
		{
			app.calendar.update_state(jQuery.extend({view: 'week'},_ev.target.dataset));
		}
		else if (this.dayHeader.has(_ev.target).length)
		{
			// Click on a day header - let day deal with it
			// First child is a selectAccount
			for(var i = 1; i < this._children.length; i++)
			{
				if(this._children[i].header && (
					this._children[i].header.has(_ev.target).length || this._children[i].header.is(_ev.target))
				)
				{
					return this._children[i].click(_ev);
				}
			}
		}
		else
		{
			var dataset = {};
			var parent = _ev.target;
			do
			{
				dataset = parent.dataset;
				parent = parent.parentNode;
			} while (jQuery.isEmptyObject(dataset) && parent !== this.node);
			if(parent === this.node) return;
			
			// Default handler to open a new event at the selected time
			var options = {
				date: dataset.date || this.day_list[0],
				hour: dataset.hour || this.options.day_start,
				minute: dataset.minute || 0
			};
			if (this.options.owner != app.calendar.state.owner)
			{
				options.owner = this.options.owner;
			}
			this.egw().open(null, 'calendar', 'add', options , '_blank');
			return false;
		}
	},

	/**
	 * Get time from position for drag and drop
	 *
	 * This does not return an actual time on a clock, but finds the closest
	 * time node (.calendar_calAddEvent or day column) to the given position.
	 * 
	 * @param {number} x
	 * @param {number} y
	 * @returns {DOMNode[]} time node(s) for the given position
	 */
	_get_time_from_position: function(x,y) {
		
		x = Math.round(x);
		y = Math.round(y);
		var nodes = this.options.granularity === 0 ?
			$j('.calendar_calDayCol',this.div) :
			$j('.calendar_calAddEvent[data-hour],.calendar_calDayColHeader',this.div);
		
		nodes = nodes
			.removeClass('drop-hover')
			.filter(function() {
				var offset = $j(this).offset();
				var range={x:[offset.left,offset.left+$j(this).outerWidth()],y:[offset.top,offset.top+$j(this).outerHeight()]};

				var i = (x >=range.x[0]  && x <= range.x[1]) && (y >= range.y[0] && y <= range.y[1]);
				return i;
			})
		nodes.addClass("drop-hover");
		
		return nodes;
	},
	
	/**
	 * Code for implementing et2_IDetachedDOM
	 *
	 * @param {array} _attrs array to add further attributes to
	 */
	getDetachedAttributes: function(_attrs) {
		_attrs.push('start_date','end_date');
	},

	getDetachedNodes: function() {
		return [this.getDOMNode()];
	},

	setDetachedAttributes: function(_nodes, _values) {
		this.div = $j(_nodes[0]);

		if(_values.start_date)
		{
			this.set_start_date(_values.start_date);
		}
		if(_values.end_date)
		{
			this.set_end_date(_values.end_date);
		}
	},

	// Resizable interface
	resize: function ()
	{
		if(this.disabled || !this.div.is(':visible'))
		{
			return;
		}

		// Set the max width to avoid animations screwing up the width
		this.div.css('max-width',$j(this.getInstanceManager().DOMContainer).width());
		
		/*
		We expect the timegrid to be in a table with 0 or more other timegrids,
		1 per row.  We want each timegrid to be as large as possible, but space
		shared equally.  Height can't be set to a percentage on the rows, because
		that doesn't work.  However, if the timegrid is too small (1/2 hour < 1 line
		height), we change to showing only the working hours with no vertical
		scrollbar.  Each week gets as much space as it needs.
		*/
		// How many rows?
		var rowCount = 0;
		this._parent.iterateOver(function(widget) {
			if(!widget.disabled) rowCount++;
		},this, et2_calendar_timegrid);

		// Take the whole tab height
		var height = $j(this.getInstanceManager().DOMContainer).parent().innerHeight();

		// Allow for toolbar
		height -= $j('#calendar-toolbar',this.div.parents('.egw_fw_ui_tab_content')).outerHeight(true);
		
		this.options.height = Math.floor(height / rowCount);
		
		// Allow for borders & padding
		this.options.height -= 2*((this.div.outerWidth(true) - this.div.innerWidth()) + parseInt(this.div.parent().css('padding-top')));

		// Calculate how much space is needed, and
		// if too small be bigger
		var needed = ((this.day_end - this.day_start) /
			(this.options.granularity / 60) * parseInt(this.div.css('line-height'))) +
			this.gridHeader.outerHeight();
		var too_small = needed > this.options.height && this.options.granularity != 0;

		$j(this.getInstanceManager().DOMContainer)
			.css({
				'overflow-y': too_small ? 'auto' : 'hidden',
				'overflow-x': 'hidden',
				'height': too_small ? height : '100%'
			});
		if(too_small)
		{
			this.options.height = needed;
			if(!this.div.hasClass('calendar_calTimeGridFixed'))
			{
				window.setTimeout(jQuery.proxy(function() {
					this._parent.iterateOver(function(widget) {
						if(!widget.disabled) widget.resize();
					},this, et2_calendar_timegrid);
				},this),1);
			}
			this.div.addClass('calendar_calTimeGridFixed');
		}
		else
		{
			this.div.removeClass('calendar_calTimeGridFixed');
		}
		this.div.css('height', this.options.height);
			
		// Re-do time grid
		if(!this.update_timer)
		{
			this._drawTimes();
		}

		// Try to resize width, though animations cause problems
		var total_width = this.days.width();
		var day_width = (total_width > 0 ? total_width : $j(this.getInstanceManager().DOMContainer).width())/this.day_widgets.length;
		// update day widgets
		for(var i = 0; i < this.day_widgets.length; i++)
		{
			var day = this.day_widgets[i];

			// Position
			day.set_left((day_width * i) + 'px');
			day.set_width(day_width + 'px');
		}
	}
});
et2_register_widget(et2_calendar_timegrid, ["calendar-timegrid"]);