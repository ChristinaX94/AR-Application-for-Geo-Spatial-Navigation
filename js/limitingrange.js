// implementation of AR-Experience (aka "World")
var World = {

    //user's latest known location, accessible via userLocation.latitude, userLocation.longitude, userLocation.altitude
	userLocation: null,

	// you may request new data from server periodically, however: in this sample data is only requested once
	isRequestingData: false,

	// true once data was fetched
	initiallyLoadedData: false,

	// different POI-Marker assets
	markerDrawable_idle: null,
	markerDrawable_selected: null,
	markerDrawable_directionIndicator: null,

	// list of AR.GeoObjects that are currently shown in the scene / World
	markerList: [],

	// The last selected marker
	currentMarker: null,
	emptyPoi:false,

	locationUpdateCounter: 0,
	updatePlacemarkDistancesEveryXLocationUpdates: 10,

    //GooglePlace
	map: null,
    service: null,
    range:500,

    // location updates, fired every time you call architectView.setLocation() in native environment
    locationChanged: function locationChangedFn(lat, lon, alt, acc) {

        // store user's current location in World.userLocation, so you always know where user is
        World.userLocation = {
            'latitude': lat,
            'longitude': lon,
            'altitude': alt,
            'accuracy': acc
        };

        // request data if not already present
        if (!World.initiallyLoadedData) {
            var list = ['point_of_interest'];
            World.markerList = [];
            World.initializeRequest(lat, lon, World.range, list);
            World.initiallyLoadedData = true;
        } else if (World.locationUpdateCounter === 0) {
            // update placemark distance information frequently, you max also update distances only every 10m with some more effort
            World.updateDistanceToUserValues();
        }

        // helper used to update placemark information every now and then (e.g. every 10 location upadtes fired)
        World.locationUpdateCounter = (++World.locationUpdateCounter % World.updatePlacemarkDistancesEveryXLocationUpdates);
    },

    initializeRequest: function initializeRequestFn(lat, lon, range, list) {
        var request;
        var location = new google.maps.LatLng(lat,lon);

        World.map = new google.maps.Map(document.createElement('div'), {
            center: location,
        });

        request = {
            location: location,
            radius: range+'',
            types: list
        };

        World.service = new google.maps.places.PlacesService(World.map);
        World.service.nearbySearch(request, World.callbackPlace);
    },

    callbackPlace: function callbackPlaceFn(results, status) {
        if(results.length==0){
            World.loadEmptyPoi();
        }
        else{
            if (status == google.maps.places.PlacesServiceStatus.OK) {
                for (var i = 0; i < results.length; i++)
                {
                    World.loadPoisFromGoogleData(results[i]);
                }
            }

            World.hideOverlappingPois();
            World.sortByRating();


        }

        document.getElementById("panel-visible-range").min = 0;
        document.getElementById("panel-visible-range").max = World.getPoiNumber();
        document.getElementById("panel-visible-range").value = World.getPoiNumber();
        $("#panel-visible-value").html(World.getPoiNumber()+ " places");
    },

    sortByRating: function sortByRatingFn(){
        if(World.markerList.length<2){ return; }
        World.quickSort(0, World.markerList.length-1);

    },

    quickSort: function quickSortFn(left, right){
        if (right-left <= 0){
            return;
        }
        else{
            var pivot = World.markerList[right].poiData.rating;
            var partitionPoint = World.partition(left, right, pivot);
            World.quickSort(left,partitionPoint-1);
            World.quickSort(partitionPoint+1,right);
        }

    },

    partition: function partitionFn(left, right, pivot){
        var leftPointer = left;
        var rightPointer = right - 1;
        while(true){
            while (World.markerList[leftPointer].poiData.rating < pivot){
                leftPointer++;
            }

            while (rightPointer > 0 && World.markerList[rightPointer].poiData.rating >= pivot)
            {
                rightPointer--;
            }

            if (leftPointer >= rightPointer){

                break;
            }
            else{
                World.swap(leftPointer,rightPointer);
            }

        }
        World.swap(leftPointer,right);
        return leftPointer;
    },

    swap: function swapFn(a, b) {
        var temp = World.markerList[a];
        World.markerList[a] = World.markerList[b];
        World.markerList[b] = temp;
    },


    loadEmptyPoi: function loadEmptyPoiFn(){
        var emptyPoi = {
            "id": "",
            "latitude": parseFloat(World.userLocation.latitude),
            "longitude": parseFloat(World.userLocation.longitude),
            "altitude": parseFloat(World.userLocation.altitude),
            "title": (""),
            "images": (""),
            "type": "",
            "rating":""
         };

        World.markerList.push(new Marker(emptyPoi,0));
        World.markerList[0].markerObject.enabled = false;
        World.updateStatusMessage('No POIs available');
        World.emptyPoi = true;
        World.updateRangeValues();
    },

    // called to inject new POI data
    loadPoisFromGoogleData: function loadPoisFromGoogleDataFn(place) {

        // start loading marker assets
        World.markerDrawable_idle = new AR.ImageResource("assets/marker_idle.png");
        World.markerDrawable_selected = new AR.ImageResource("assets/marker_selected.png");
        World.markerDrawable_directionIndicator = new AR.ImageResource("assets/indi.png");

        var type= place.types[0];
        for(var i=1;i<place.types.length;i++){
            type = type + ", " + place.types[i];
        }

        var rating = -1;
        if(place.rating!=null){
            rating = place.rating;
        }


        var myGeoLocation = new AR.GeoLocation(parseFloat(place.geometry.location.lat()),parseFloat(place.geometry.location.lng()));
        var distance = myGeoLocation.distanceToUser();

        var singlePoi = {
            "id": place.place_id,
            "latitude": parseFloat(place.geometry.location.lat()),
            "longitude": parseFloat(place.geometry.location.lng()),
            "altitude": parseFloat(10*(distance/500)),//(AR.CONST.UNKNOWN_ALTITUDE), use this value to ignore altitude information in general - marker will always be on user-level
            "title": (place.name+""),
            "images": (place.photos),
            "type": type,
            "rating": rating
        };

        World.markerList.push(new Marker(singlePoi,distance));
        World.markerList[World.markerList.length-1].markerObject.enabled = false;
        World.updateStatusMessage("Loading POIs",true);

        // updates distance information of all placemarks
        //World.updateDistanceToUserValues();
        World.updateRangeValues();

    },

    // sets/updates distances of all makers so they are available way faster than calling (time-consuming) distanceToUser() method all the time
    updateDistanceToUserValues: function updateDistanceToUserValuesFn() {
        for (var i = 0; i < World.markerList.length; i++) {
            World.markerList[i].distanceToUser = World.markerList[i].markerObject.locations[0].distanceToUser();
        }
    },

    // updates status message shown in small "i"-button aligned bottom center
    updateStatusMessage: function updateStatusMessageFn(message, isWarning) {

        var themeToUse = isWarning ? "e" : "c";
        var iconToUse = isWarning ? "alert" : "info";

        $("#status-message").html(message);
        $("#popupInfoButton").buttonMarkup({
            theme: themeToUse
        });
        $("#popupInfoButton").buttonMarkup({
            icon: iconToUse
        });
    },

    // udpates values show in "range panel"
    updateRangeValues: function updateRangeValuesFn() {

        var range_value = $("#panel-distance-range").val();
        $("#panel-distance-value").html(range_value +" m");
        return range_value;

    },

    // returns distance in meters of placemark with maxdistance * 1.1
    /*getMaxDistance: function getMaxDistanceFn() {

        // sort places by distance so the first entry is the one with the maximum distance
        World.markerList.sort(World.sortByDistanceSortingDescending);

        // use distanceToUser to get max-distance
        var maxDistanceMeters = World.markerList[0].distanceToUser;

        // return maximum distance times some factor >1.0 so ther is some room left and small movements of user don't cause places far away to disappear
        return maxDistanceMeters * 1.1;
    },*/

    // helper to sort places by distance, descending
    /*sortByDistanceSortingDescending: function(a, b) {
        return b.distanceToUser - a.distanceToUser;
    },*/


    hideOverlappingPois: function hideOverlappingPoisFn() {

        var visibleList=[];

        for (var i = 0; i < World.markerList.length; i++)
        {
            var slope = (World.markerList[i].poiData.longitude-World.userLocation.longitude)/(World.markerList[i].poiData.latitude-World.userLocation.latitude); //klish m =y2-y1/x2-x1
            var line = function (y1,x1,x,slope) {return y1+slope*(x-x1)};
            visibleList.push({ distanceToUser: World.markerList[i].distanceToUser, visible: World.markerList[i], m:slope, y:line });
        }

        for (var i = 0; i < visibleList.length-1; i++)
        {
            for (var j = i+1; j < visibleList.length; j++){

                var tan = Math.tan(Math.abs(visibleList[j].m-visibleList[i].m)/(1+visibleList[j].m*visibleList[i].m)); //tanq=|m2-m1|/|1+m2*m1|
                var degrees = Math.atan(tan)*180/Math.PI; //q in degrees

                if(Math.abs(degrees)<=2){

                    var index = -1;

                    if(visibleList[i].distanceToUser < visibleList[j].distanceToUser){
                        index = World.markerList.indexOf(visibleList[j].visible);
                    }
                    else{
                        index = World.markerList.indexOf(visibleList[i].visible);
                    }
                    if(index>-1){
                         //World.markerList[index].markerObject.enabled = false;
                         World.markerList[index].markerObject.destroy();
                         World.markerList.splice(index, 1);
                    }
                }
            }
        }
        for( var i=0; i<World.markerList.length;i++){
            World.markerList[i].markerObject.enabled = true;
        }
        World.updateStatusMessage(World.markerList.length + ' places loaded');
    },

    // screen was clicked but no geo-object was hit
    onScreenClick: function onScreenClickFn() {
        alert("No marker selected");
    },

    getPoiNumber: function getPoiNumberFn(){
        if((World.markerList.length<=-1)||(World.emptyPoi == true)){
            return 0;
        }
        return World.markerList.length;

    },

    setVisiblePlaces: function setVisiblePlacesFn(slider_value){
        if(slider_value>=World.markerList.length){return;}
        var counter = 1;
        while(counter <= slider_value){
            World.markerList[World.markerList.length - counter].markerObject.enabled = true;
            counter++;
        }
        while(counter <= World.markerList.length){
            World.markerList[World.markerList.length - counter].markerObject.enabled = false;
            counter++;
        }

    },

    // display range slider
    showRange: function showRangeFn() {

        //if (World.getPoiNumber() > 0) {


            // update labels on every range movement
            $('#panel-distance-range').change(function() {
                World.range = World.updateRangeValues();
            });
            $('#panel-visible-range').change(function() {
                var visible_value = $("#panel-visible-range").val();
                $("#panel-visible-value").html(visible_value+ " places");
                World.setVisiblePlaces(visible_value);
            });
            World.range = World.updateRangeValues();


            // open panel
            $("#panel-distance").trigger("updatelayout");
            $("#panel-distance").panel("open", 1234);
        //}
        //else {
            // no places are visible, because the are not loaded yet
            //World.updateStatusMessage('No places available yet', true);
        //}
    },

    startNewRequest: function startNewRequestFn(){
        var list = World.getChosenTypes();
        for( var i=0; i<World.markerList.length;i++){
            World.markerList[i].markerObject.destroy();
        }
        World.markerList = [];
        World.emptyPoi = false;
        World.updateStatusMessage("Loading POIs",true);
        World.initializeRequest(World.userLocation.latitude,World.userLocation.longitude, World.range, list);
    },

    getChosenTypes: function getChosenTypes(){

        var poiList = document.forms['checkList'].elements[ 'poiList[]' ];
        var list = [];

        for (var i=0; i<poiList.length; i++) {
            if(poiList[i].checked){
                list.push(poiList[i].value);
            }
        }
        if(list.indexOf("point_of_interest")!=-1||list.length==0){
            list = ['point_of_interest'];
        }

        return list;
    },

    onMarkerSelected: function onMarkerSelectedFn(marker) {
        World.currentMarker = marker;
        World.requestDetails(marker.poiData);
        marker.markerObject.onEnterFieldOfVision();
    },

	requestDetails: function requestDetailsFn(place) {
        var location = new google.maps.LatLng(place.latitude,place.longitude);
            World.map = new google.maps.Map(document.createElement('div'), {
            center: location,
        });
        var request = {
            placeId: place.id+""
        };

        World.service = new google.maps.places.PlacesService(World.map);

        World.service.getDetails(request, World.callbackDetails);

    },

    callbackDetails: function callbackDetailsFn(place, status) {
        if (status == google.maps.places.PlacesServiceStatus.OK) {
            World.setMarkerPanel(place);
        }
    },

    setMarkerPanel: function setMarkerPanelFn(place) {

        // update panel values
        var rating = "Not available";
        if(place.rating!=null){
            rating = place.rating;
        }

        var review ="";
        if(place.reviews!=null && place.reviews[0].text!=""){
            for(var i =0; i<place.reviews.length; i++){
                if(place.reviews[i].text!=""){
                    review = review + "<br><br>" +"|*| "+ place.reviews[i].text;
                }
            }
        }
        else{
            review = "Not available";
        }

        $("#poi-detail-title").html(World.currentMarker.poiData.title);
        $("#poi-detail-description").html(place.formatted_address+"");
        $("#poi-detail-rating").html(rating);//rating);
        $("#poi-detail-review").html(review);
        $("#poi-detail-type").html(World.currentMarker.poiData.type+"");//

        World.setImages(World.currentMarker);

        // It's ok for AR.Location subclass objects to return a distance of `undefined`. In case such a distance was calculated when all distances were queried in `updateDistanceToUserValues`, we recalculate this specific distance before we update the UI.
        if( undefined == World.currentMarker.distanceToUser ) {
            World.currentMarker.distanceToUser = World.currentMarker.markerObject.locations[0].distanceToUser();
        }

        // distance and altitude are measured in meters by the SDK. You may convert them to miles / feet if required.
        var distanceToUserValue = (World.currentMarker.distanceToUser > 999) ? ((World.currentMarker.distanceToUser / 1000).toFixed(2) + " km") : (Math.round(World.currentMarker.distanceToUser) + " m");

        $("#poi-detail-distance").html(distanceToUserValue);

        // show panel
        $("#panel-poidetail").panel("open", 123);

        $(".ui-panel-dismiss").unbind("mousedown");

        // deselect AR-marker when user exits detail screen div.
        $("#panel-poidetail").on("panelbeforeclose", function(event, ui) {
            World.currentMarker.setDeselected(World.currentMarker);
        });
    },

    setImages: function setImagesFn(marker){

        while(document.getElementById("img-container").firstElementChild != null){
            document.getElementById("img-container").removeChild(document.getElementById("img-container").firstElementChild);
        } //afairw tis eikones apo allo poi pou exei anoixei o xrhsths

        var imageNumber = 1;
        if( marker.poiData.images != null){
            imageNumber = marker.poiData.images.length;
        }

        for (var i=0;i<imageNumber;i++){

            var img = document.createElement("img");  //element eikonas
            img.setAttribute("class", "image");
            img.setAttribute("id","img"+i.toString);

            if(marker.poiData.images == null){
                img.src = "http://icons.iconarchive.com/icons/icons8/windows-8/128/City-No-Camera-icon.png";
                img.setAttribute("style", "width:20px;height:20px;");
            }
            else{
                img.src = marker.poiData.images[i].getUrl({'maxWidth': 600, 'maxHeight': 800});
                img.setAttribute("style", "margin:3px;width:60px;height:60px;");
                img.onclick = function(e) {
                    AR.context.openInBrowser(e.target.src);
                }
            }
            document.getElementById("img-container").appendChild(img);
        }
    }
};

/* forward locationChanges to custom function */
AR.context.onLocationChanged = World.locationChanged;

/* forward clicks in empty area to World */
AR.context.onScreenClick = World.onScreenClick;